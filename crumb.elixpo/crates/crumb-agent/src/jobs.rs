//! Lazy, local persistence for explicitly approved background agent jobs.

use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{AgentConfig, SessionId};

const MANIFEST: &str = "job.json";
const LOCK: &str = ".lock";
const MAX_MANIFEST_BYTES: u64 = 2 * 1024 * 1024;
static NEXT_JOB: AtomicU64 = AtomicU64::new(0);

/// Validated directory-safe job identifier.
#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(transparent)]
pub struct JobId(String);

impl JobId {
    /// Creates a validated job identifier.
    ///
    /// # Errors
    ///
    /// Returns an error unless the value is a short directory-safe identifier.
    pub fn new(value: impl Into<String>) -> Result<Self> {
        let value = value.into();
        if value.is_empty()
            || value.len() > 80
            || !value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            bail!("job id must contain 1-80 ASCII letters, numbers, dashes, or underscores");
        }
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Local execution timing. Scheduled variants require explicit opt-in.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum JobSchedule {
    Immediate,
    Once {
        run_at_ms: u64,
    },
    Recurring {
        every_seconds: u64,
        next_run_at_ms: u64,
    },
}

/// Persisted lifecycle state. Output and provider errors are never stored raw.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum JobState {
    Queued,
    Running {
        started_at_ms: u64,
        process_id: u32,
    },
    CancellationRequested {
        requested_at_ms: u64,
        process_id: u32,
    },
    Completed {
        finished_at_ms: u64,
    },
    Failed {
        finished_at_ms: u64,
        error_digest: String,
    },
    Cancelled {
        finished_at_ms: u64,
    },
}

impl JobState {
    const fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed { .. } | Self::Failed { .. } | Self::Cancelled { .. }
        )
    }
}

/// User-owned request used to create a local job.
pub struct NewJob {
    pub request: String,
    pub config: AgentConfig,
    pub schedule: JobSchedule,
    pub scheduler_opt_in: bool,
}

/// Complete runner-facing definition. Its custom debug output omits the request.
#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct JobDefinition {
    pub id: JobId,
    pub created_at_ms: u64,
    pub workspace: PathBuf,
    pub request_bytes: usize,
    pub request_digest: String,
    pub config: AgentConfig,
    pub schedule: JobSchedule,
    pub scheduler_opt_in: bool,
    pub state: JobState,
    pub session_id: Option<SessionId>,
    request: String,
}

impl JobDefinition {
    /// Returns the approved request only to the local runner.
    #[must_use]
    pub fn request(&self) -> &str {
        &self.request
    }
}

impl fmt::Debug for JobDefinition {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("JobDefinition")
            .field("id", &self.id)
            .field("workspace", &self.workspace)
            .field("request_bytes", &self.request_bytes)
            .field("request_digest", &self.request_digest)
            .field("schedule", &self.schedule)
            .field("scheduler_opt_in", &self.scheduler_opt_in)
            .field("state", &self.state)
            .field("session_id", &self.session_id)
            .finish_non_exhaustive()
    }
}

/// Redacted list/inspect projection.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct JobSummary {
    pub id: JobId,
    pub created_at_ms: u64,
    pub workspace: PathBuf,
    pub request_bytes: usize,
    pub request_digest: String,
    pub schedule: JobSchedule,
    pub scheduler_opt_in: bool,
    pub state: JobState,
    pub session_id: Option<SessionId>,
}

/// A due job plus the approved request and exact configuration snapshot.
pub struct ScheduledRun {
    pub definition: JobDefinition,
}

/// Lazy workspace-confined job ledger. Construction performs no I/O.
#[derive(Clone, Debug)]
pub struct JobStore {
    workspace: PathBuf,
    root: PathBuf,
}

impl JobStore {
    /// Selects a local workspace without creating or scanning its job directory.
    #[must_use]
    pub fn new(workspace: PathBuf) -> Self {
        let root = workspace.join(".crumb").join("jobs");
        Self { workspace, root }
    }

    /// Creates a credential-safe job definition with snapshotted policy.
    ///
    /// # Errors
    ///
    /// Returns an error for an unavailable workspace, unsafe request, invalid
    /// configuration, missing schedule opt-in, or persistence failure.
    pub fn create(&self, new_job: NewJob) -> Result<JobSummary> {
        let workspace = self.canonical_workspace()?;
        new_job.config.validate()?;
        validate_schedule(&new_job.schedule, new_job.scheduler_opt_in)?;
        validate_request(&new_job.request, &new_job.config)?;
        let id = next_job_id();
        let definition = JobDefinition {
            id: id.clone(),
            created_at_ms: timestamp_ms(),
            workspace,
            request_bytes: new_job.request.len(),
            request_digest: digest(new_job.request.as_bytes()),
            config: new_job.config,
            schedule: new_job.schedule,
            scheduler_opt_in: new_job.scheduler_opt_in,
            state: JobState::Queued,
            session_id: None,
            request: new_job.request,
        };
        let root = self.ensure_root()?;
        let directory = root.join(id.as_str());
        fs::create_dir(&directory).context("failed to create job directory")?;
        if let Err(error) = write_definition(&directory, &definition) {
            let _ = fs::remove_dir(&directory);
            return Err(error);
        }
        Ok(summary(&definition))
    }

    /// Lists redacted job summaries newest-first.
    ///
    /// # Errors
    ///
    /// Returns an error when the ledger cannot be read. Invalid entries are
    /// skipped so one damaged job does not hide healthy jobs.
    pub fn list(&self) -> Result<Vec<JobSummary>> {
        if !self.root.is_dir() {
            return Ok(Vec::new());
        }
        let mut jobs = fs::read_dir(self.ensure_root()?)
            .context("failed to read job ledger")?
            .filter_map(std::result::Result::ok)
            .filter_map(|entry| self.load(&entry.file_name().to_string_lossy()).ok())
            .map(|definition| summary(&definition))
            .collect::<Vec<_>>();
        jobs.sort_by_key(|job| std::cmp::Reverse(job.created_at_ms));
        Ok(jobs)
    }

    /// Loads one runner-facing job after revalidating its policy snapshot.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid identifier, manifest, workspace, request,
    /// or configuration.
    pub fn load(&self, id: &str) -> Result<JobDefinition> {
        let id = JobId::new(id)?;
        let directory = self.job_directory(&id)?;
        let path = directory.join(MANIFEST);
        let metadata = fs::symlink_metadata(&path).context("failed to inspect job manifest")?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() > MAX_MANIFEST_BYTES
        {
            bail!("job manifest must be a bounded regular non-symlink file");
        }
        let definition: JobDefinition =
            serde_json::from_slice(&fs::read(&path).context("failed to read job manifest")?)
                .context("invalid job manifest")?;
        if definition.id != id || definition.workspace != self.canonical_workspace()? {
            bail!("job manifest identity or workspace mismatch");
        }
        if definition.request_bytes != definition.request.len()
            || definition.request_digest != digest(definition.request.as_bytes())
        {
            bail!("job request integrity check failed");
        }
        definition.config.validate()?;
        validate_schedule(&definition.schedule, definition.scheduler_opt_in)?;
        validate_request(&definition.request, &definition.config)?;
        Ok(definition)
    }

    /// Loads one redacted job projection.
    ///
    /// # Errors
    ///
    /// Returns the same validation and persistence errors as [`Self::load`].
    pub fn inspect(&self, id: &str) -> Result<JobSummary> {
        self.load(id).map(|definition| summary(&definition))
    }

    /// Marks a queued job as running in the current local worker.
    ///
    /// # Errors
    ///
    /// Returns an error unless the job is queued and can be updated atomically.
    pub fn mark_running(&self, id: &str, process_id: u32) -> Result<JobSummary> {
        self.claim_due(id, process_id).map(|job| summary(&job))
    }

    /// Atomically claims a due queued job for one local worker.
    ///
    /// # Errors
    ///
    /// Returns an error unless the job is queued, due, and can be updated.
    pub fn claim_due(&self, id: &str, process_id: u32) -> Result<JobDefinition> {
        let id = JobId::new(id)?;
        let directory = self.job_directory(&id)?;
        let _lock = JobLock::acquire(&directory)?;
        let mut definition = self.load(id.as_str())?;
        if definition.state != JobState::Queued {
            bail!("only queued jobs can start");
        }
        if !schedule_due(&definition.schedule, timestamp_ms()) {
            bail!("scheduled job is not due");
        }
        definition.state = JobState::Running {
            started_at_ms: timestamp_ms(),
            process_id,
        };
        write_definition(&directory, &definition)?;
        Ok(definition)
    }

    /// Attaches a redacted agent session identifier to a running job.
    ///
    /// # Errors
    ///
    /// Returns an error unless the job is active and persistence succeeds.
    pub fn attach_session(&self, id: &str, session_id: SessionId) -> Result<JobSummary> {
        self.update(id, |job| {
            if !matches!(&job.state, JobState::Running { .. }) {
                bail!("only a running job can attach a session");
            }
            job.session_id = Some(session_id);
            Ok(())
        })
    }

    /// Requests cancellation without sending operating-system signals itself.
    ///
    /// # Errors
    ///
    /// Returns an error for a completed job or persistence failure.
    pub fn request_cancel(&self, id: &str) -> Result<JobSummary> {
        self.update(id, |job| {
            job.state = match &job.state {
                JobState::Queued => JobState::Cancelled {
                    finished_at_ms: timestamp_ms(),
                },
                JobState::Running { process_id, .. } => JobState::CancellationRequested {
                    requested_at_ms: timestamp_ms(),
                    process_id: *process_id,
                },
                _ if job.state.is_terminal() => bail!("job has already finished"),
                JobState::CancellationRequested { .. } => {
                    bail!("job cancellation was already requested")
                }
                _ => unreachable!(),
            };
            Ok(())
        })
    }

    /// Returns queued jobs whose explicit schedule is due.
    ///
    /// # Errors
    ///
    /// Returns an error when the ledger cannot be read or a due definition is
    /// invalid.
    pub fn due(&self, now_ms: u64) -> Result<Vec<ScheduledRun>> {
        self.list()?
            .into_iter()
            .filter(|job| job.state == JobState::Queued && schedule_due(&job.schedule, now_ms))
            .map(|job| {
                self.load(job.id.as_str())
                    .map(|definition| ScheduledRun { definition })
            })
            .collect()
    }

    /// Returns jobs due according to the local system clock.
    ///
    /// # Errors
    ///
    /// Returns the same ledger errors as [`Self::due`].
    pub fn due_now(&self) -> Result<Vec<ScheduledRun>> {
        self.due(timestamp_ms())
    }

    /// Completes one run, requeueing recurring jobs at their next interval.
    ///
    /// Provider error text is reduced to a digest before persistence.
    ///
    /// # Errors
    ///
    /// Returns an error unless the job is active and persistence succeeds.
    pub fn finish(&self, id: &str, error: Option<&str>) -> Result<JobSummary> {
        self.update(id, |job| {
            if !matches!(
                &job.state,
                JobState::Running { .. } | JobState::CancellationRequested { .. }
            ) {
                bail!("only an active job can finish");
            }
            if matches!(&job.state, JobState::CancellationRequested { .. }) {
                job.state = JobState::Cancelled {
                    finished_at_ms: timestamp_ms(),
                };
                return Ok(());
            }
            if let JobSchedule::Recurring {
                every_seconds,
                next_run_at_ms,
            } = &mut job.schedule
                && error.is_none()
            {
                *next_run_at_ms =
                    timestamp_ms().saturating_add(every_seconds.saturating_mul(1_000));
                job.state = JobState::Queued;
                job.session_id = None;
                return Ok(());
            }
            job.state = error.map_or_else(
                || JobState::Completed {
                    finished_at_ms: timestamp_ms(),
                },
                |message| JobState::Failed {
                    finished_at_ms: timestamp_ms(),
                    error_digest: digest(message.as_bytes()),
                },
            );
            Ok(())
        })
    }

    fn update(
        &self,
        id: &str,
        update: impl FnOnce(&mut JobDefinition) -> Result<()>,
    ) -> Result<JobSummary> {
        let id = JobId::new(id)?;
        let directory = self.job_directory(&id)?;
        let _lock = JobLock::acquire(&directory)?;
        let mut definition = self.load(id.as_str())?;
        update(&mut definition)?;
        write_definition(&directory, &definition)?;
        Ok(summary(&definition))
    }

    fn canonical_workspace(&self) -> Result<PathBuf> {
        let workspace =
            fs::canonicalize(&self.workspace).context("failed to resolve job workspace")?;
        if !workspace.is_dir() {
            bail!("job workspace must be a directory");
        }
        Ok(workspace)
    }

    fn ensure_root(&self) -> Result<PathBuf> {
        let workspace = self.canonical_workspace()?;
        let crumb = workspace.join(".crumb");
        ensure_directory(&crumb)?;
        ensure_directory(&self.root)?;
        let root = fs::canonicalize(&self.root).context("failed to resolve job ledger")?;
        if !root.starts_with(workspace) {
            bail!("job ledger escapes its workspace");
        }
        Ok(root)
    }

    fn job_directory(&self, id: &JobId) -> Result<PathBuf> {
        let root = self.ensure_root()?;
        let directory = fs::canonicalize(root.join(id.as_str())).context("job does not exist")?;
        if !directory.starts_with(root) || !directory.is_dir() {
            bail!("job directory is invalid");
        }
        Ok(directory)
    }
}

struct JobLock(PathBuf);

impl JobLock {
    fn acquire(directory: &Path) -> Result<Self> {
        let path = directory.join(LOCK);
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .context("job is busy")?;
        Ok(Self(path))
    }
}

impl Drop for JobLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn validate_schedule(schedule: &JobSchedule, opted_in: bool) -> Result<()> {
    match schedule {
        JobSchedule::Immediate => Ok(()),
        JobSchedule::Once { run_at_ms } if opted_in && *run_at_ms > 0 => Ok(()),
        JobSchedule::Recurring {
            every_seconds,
            next_run_at_ms,
        } if opted_in && *every_seconds > 0 && *next_run_at_ms > 0 => Ok(()),
        JobSchedule::Once { .. } | JobSchedule::Recurring { .. } if !opted_in => {
            bail!("scheduled jobs require explicit scheduler opt-in")
        }
        _ => bail!("scheduled jobs require positive timing values"),
    }
}

fn validate_request(request: &str, config: &AgentConfig) -> Result<()> {
    if request.trim().is_empty() {
        bail!("job request cannot be empty");
    }
    let limit = usize::try_from(config.limits.max_steering_bytes).unwrap_or(usize::MAX);
    if request.len() > limit {
        bail!("job request exceeds the configured byte limit");
    }
    let normalized = request
        .to_ascii_lowercase()
        .chars()
        .filter(|character| !character.is_ascii_whitespace() && !matches!(character, '"' | '\''))
        .collect::<String>();
    if normalized.contains("-----beginprivatekey-----")
        || normalized.contains("authorization:bearer")
        || normalized.contains("api_key=")
        || normalized.contains("apikey=")
        || normalized.contains("password=")
        || normalized.contains("secret=")
        || normalized.contains("token=")
        || normalized.contains("access_token=")
        || normalized.contains("refresh_token=")
    {
        bail!("job requests cannot persist credential-like content");
    }
    Ok(())
}

fn schedule_due(schedule: &JobSchedule, now_ms: u64) -> bool {
    match schedule {
        JobSchedule::Immediate => true,
        JobSchedule::Once { run_at_ms } => now_ms >= *run_at_ms,
        JobSchedule::Recurring { next_run_at_ms, .. } => now_ms >= *next_run_at_ms,
    }
}

fn summary(definition: &JobDefinition) -> JobSummary {
    JobSummary {
        id: definition.id.clone(),
        created_at_ms: definition.created_at_ms,
        workspace: definition.workspace.clone(),
        request_bytes: definition.request_bytes,
        request_digest: definition.request_digest.clone(),
        schedule: definition.schedule.clone(),
        scheduler_opt_in: definition.scheduler_opt_in,
        state: definition.state.clone(),
        session_id: definition.session_id.clone(),
    }
}

fn ensure_directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => bail!("job state cannot be a symlink"),
        Ok(metadata) if !metadata.is_dir() => bail!("job state must be a directory"),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path).context("failed to create job state directory")
        }
        Err(error) => Err(error).context("failed to inspect job state directory"),
    }
}

fn write_definition(directory: &Path, definition: &JobDefinition) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(definition).context("failed to encode job definition")?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_MANIFEST_BYTES {
        bail!("job manifest exceeds its size limit");
    }
    let temporary = directory.join("job.tmp");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .context("failed to create temporary job manifest")?;
    file.write_all(&bytes)
        .context("failed to write job manifest")?;
    file.sync_all().context("failed to flush job manifest")?;
    drop(file);
    let manifest = directory.join(MANIFEST);
    if manifest.exists() {
        let metadata = fs::symlink_metadata(&manifest).context("failed to inspect job manifest")?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            let _ = fs::remove_file(&temporary);
            bail!("job manifest must be a regular non-symlink file");
        }
        let backup = directory.join("job.bak");
        fs::rename(&manifest, &backup).context("failed to stage previous job manifest")?;
        if let Err(error) = fs::rename(&temporary, &manifest) {
            let _ = fs::rename(&backup, &manifest);
            return Err(error).context("failed to install job manifest");
        }
        fs::remove_file(backup).context("failed to remove previous job manifest")?;
    } else {
        fs::rename(&temporary, &manifest).context("failed to install job manifest")?;
    }
    Ok(())
}

fn next_job_id() -> JobId {
    JobId(format!(
        "job-{}-{}-{}",
        timestamp_ms(),
        std::process::id(),
        NEXT_JOB.fetch_add(1, Ordering::Relaxed)
    ))
}

fn timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
        })
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Workspace(PathBuf);

    impl Workspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "crumb-jobs-{}-{}",
                std::process::id(),
                NEXT_JOB.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).expect("workspace is created");
            Self(path)
        }
    }

    impl Drop for Workspace {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).expect("workspace is removed");
        }
    }

    fn immediate(request: &str) -> NewJob {
        NewJob {
            request: request.to_owned(),
            config: AgentConfig::default(),
            schedule: JobSchedule::Immediate,
            scheduler_opt_in: false,
        }
    }

    #[test]
    fn store_is_lazy_and_summaries_are_redacted() {
        let workspace = Workspace::new();
        let store = JobStore::new(workspace.0.clone());
        assert!(!workspace.0.join(".crumb/jobs").exists());
        let created = store
            .create(immediate("update the readme"))
            .expect("job is created");
        assert_eq!(created.request_bytes, 17);
        let serialized = serde_json::to_string(&created).expect("summary serializes");
        assert!(!serialized.contains("update the readme"));
        assert!(
            !format!("{:?}", store.load(created.id.as_str()).expect("job loads"))
                .contains("update the readme")
        );
        assert_eq!(store.list().expect("jobs list").len(), 1);
    }

    #[test]
    fn credential_like_requests_are_rejected_before_persistence() {
        let workspace = Workspace::new();
        let store = JobStore::new(workspace.0.clone());
        assert!(store.create(immediate("API_KEY = secret-value")).is_err());
        assert!(!workspace.0.join(".crumb/jobs").exists());
    }

    #[test]
    fn schedules_require_explicit_opt_in() {
        let workspace = Workspace::new();
        let store = JobStore::new(workspace.0.clone());
        let mut job = immediate("run the report");
        job.schedule = JobSchedule::Once { run_at_ms: 10 };
        assert!(store.create(job).is_err());
    }

    #[test]
    fn due_jobs_use_snapshotted_policy_and_support_cancellation() {
        let workspace = Workspace::new();
        let store = JobStore::new(workspace.0.clone());
        let created = store
            .create(immediate("check the workspace"))
            .expect("job is created");
        let due = store.due(u64::MAX).expect("due jobs load");
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].definition.config, AgentConfig::default());
        let cancelled = store
            .request_cancel(created.id.as_str())
            .expect("job cancels");
        assert!(matches!(cancelled.state, JobState::Cancelled { .. }));
    }
}
