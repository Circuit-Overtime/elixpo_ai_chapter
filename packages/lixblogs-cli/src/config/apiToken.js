import { readFile } from "node:fs/promises";

const TOKEN_PATTERN = /^lix_pat_[A-Za-z0-9_-]{32,120}$/;

export class ApiTokenConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiTokenConfigurationError";
    this.code = "invalid_api_token_configuration";
  }
}

function validateToken(value, source) {
  const token = String(value || "").trim();
  if (!TOKEN_PATTERN.test(token)) {
    throw new ApiTokenConfigurationError(`${source} does not contain a valid LixBlogs personal access token.`);
  }
  return token;
}

export async function resolveApiToken({ flags = {}, env = process.env, readFileImpl = readFile } = {}) {
  const explicitFile = flags.tokenFile;
  const environmentToken = env.LIXBLOGS_TOKEN;
  const environmentFile = env.LIXBLOGS_TOKEN_FILE;

  if (explicitFile) {
    try {
      return {
        token: validateToken(await readFileImpl(explicitFile, "utf8"), `Token file ${explicitFile}`),
        source: "token-file",
      };
    } catch (error) {
      if (error instanceof ApiTokenConfigurationError) throw error;
      throw new ApiTokenConfigurationError(`Could not read token file ${explicitFile}: ${error.message}`);
    }
  }
  if (environmentToken) {
    return { token: validateToken(environmentToken, "LIXBLOGS_TOKEN"), source: "environment" };
  }
  if (environmentFile) {
    try {
      return {
        token: validateToken(await readFileImpl(environmentFile, "utf8"), `Token file ${environmentFile}`),
        source: "environment-file",
      };
    } catch (error) {
      if (error instanceof ApiTokenConfigurationError) throw error;
      throw new ApiTokenConfigurationError(`Could not read token file ${environmentFile}: ${error.message}`);
    }
  }
  return null;
}
