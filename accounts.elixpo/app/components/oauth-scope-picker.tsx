"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Button,
    Checkbox,
    IconButton,
    InputAdornment,
    TextField,
    Typography,
} from "@mui/material";
import { useDeferredValue, useMemo, useState } from "react";
import {
    type CustomOAuthScope,
    filterScopeOptions,
    type OAuthScopeOption,
    scopeOptionsForClient,
    validateCustomScopes,
} from "@/lib/oauth-scope-registry";

const GROUP_LABELS: Record<OAuthScopeOption["group"], string> = {
    standard: "Standard",
    product: "Product",
    custom: "Your product",
    unavailable: "Unavailable",
};

export function OAuthScopePicker({
    selectedScopes,
    customScopes,
    onSelectedScopesChange,
    onCustomScopesChange,
}: {
    selectedScopes: string[];
    customScopes: CustomOAuthScope[];
    onSelectedScopesChange: (scopes: string[]) => void;
    onCustomScopesChange: (scopes: CustomOAuthScope[]) => void;
}) {
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const [draft, setDraft] = useState<CustomOAuthScope>({
        name: "",
        label: "",
        description: "",
    });
    const [error, setError] = useState("");

    const visibleOptions = useMemo(() => {
        const all = scopeOptionsForClient(customScopes, selectedScopes);
        return filterScopeOptions(all, deferredQuery, selectedScopes);
    }, [customScopes, deferredQuery, selectedScopes]);

    const toggle = (name: string, checked: boolean) => {
        onSelectedScopesChange(
            checked
                ? [...new Set([...selectedScopes, name])]
                : selectedScopes.filter((scope) => scope !== name),
        );
    };

    const addCustomScope = () => {
        const result = validateCustomScopes([...customScopes, draft]);
        if ("error" in result) {
            setError(result.error);
            return;
        }
        setError("");
        onCustomScopesChange(result.scopes);
        onSelectedScopesChange([
            ...new Set([...selectedScopes, draft.name.trim()]),
        ]);
        setDraft({ name: "", label: "", description: "" });
    };

    const removeCustomScope = (name: string) => {
        onCustomScopesChange(
            customScopes.filter((scope) => scope.name !== name),
        );
        onSelectedScopesChange(
            selectedScopes.filter((scope) => scope !== name),
        );
    };

    return (
        <Box>
            <TextField
                fullWidth
                size="small"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search scopes by name or description"
                inputProps={{ "aria-label": "Search OAuth scopes" }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                        </InputAdornment>
                    ),
                }}
                sx={{ mb: 1.5 }}
            />

            <Box
                sx={{
                    maxHeight: 280,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    p: 1.25,
                }}
            >
                {visibleOptions.length === 0 ? (
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            py: 2,
                            textAlign: "center",
                        }}
                    >
                        No scopes match “{query}”.
                    </Typography>
                ) : (
                    (
                        [
                            "standard",
                            "product",
                            "custom",
                            "unavailable",
                        ] as const
                    ).map((group) => {
                        const options = visibleOptions.filter(
                            (scope) => scope.group === group,
                        );
                        if (options.length === 0) return null;

                        const renderScope = (scope: OAuthScopeOption) => (
                            <Box
                                key={scope.name}
                                sx={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 0.5,
                                    py: 0.5,
                                }}
                            >
                                <Checkbox
                                    size="small"
                                    checked={selectedScopes.includes(
                                        scope.name,
                                    )}
                                    onChange={(event) =>
                                        toggle(scope.name, event.target.checked)
                                    }
                                    inputProps={{
                                        "aria-label": `${scope.label} (${scope.name})`,
                                    }}
                                />
                                <Box
                                    sx={{
                                        flex: 1,
                                        minWidth: 0,
                                        pt: 0.35,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {scope.label}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontFamily: "monospace",
                                            fontSize: "0.7rem",
                                        }}
                                    >
                                        {scope.name}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-muted)",
                                            fontSize: "0.72rem",
                                        }}
                                    >
                                        {scope.description}
                                    </Typography>
                                </Box>
                                {group === "custom" ? (
                                    <IconButton
                                        size="small"
                                        aria-label={`Delete custom scope ${scope.name}`}
                                        onClick={() =>
                                            removeCustomScope(scope.name)
                                        }
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                ) : null}
                            </Box>
                        );

                        if (group === "product") {
                            const groupedByPrefix = options.reduce(
                                (acc, scope) => {
                                    const prefix = scope.name.split(":")[0];
                                    if (!acc[prefix]) acc[prefix] = [];
                                    acc[prefix].push(scope);
                                    return acc;
                                },
                                {} as Record<string, OAuthScopeOption[]>,
                            );

                            return (
                                <Box
                                    key={group}
                                    sx={{ mb: 1.5, "&:last-child": { mb: 0 } }}
                                >
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.7rem",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            mb: 0.5,
                                        }}
                                    >
                                        {GROUP_LABELS[group]}
                                    </Typography>
                                    {Object.entries(groupedByPrefix).map(
                                        ([prefix, scopes]) => (
                                            <Accordion
                                                key={prefix}
                                                disableGutters
                                                elevation={0}
                                                sx={{
                                                    border: "1px solid var(--border)",
                                                    mb: 1,
                                                    "&:last-child": { mb: 0 },
                                                    "&:before": {
                                                        display: "none",
                                                    },
                                                    bgcolor: "transparent",
                                                }}
                                            >
                                                <AccordionSummary
                                                    expandIcon={
                                                        <ExpandMoreIcon
                                                            sx={{
                                                                color: "var(--fg-faint)",
                                                            }}
                                                        />
                                                    }
                                                    sx={{
                                                        minHeight: 36,
                                                        "& .MuiAccordionSummary-content":
                                                            { my: 1 },
                                                    }}
                                                >
                                                    <Typography
                                                        sx={{
                                                            color: "var(--fg)",
                                                            fontSize: "0.8rem",
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        {prefix}
                                                    </Typography>
                                                </AccordionSummary>
                                                <AccordionDetails
                                                    sx={{ p: 1, pt: 0 }}
                                                >
                                                    {(
                                                        scopes as OAuthScopeOption[]
                                                    ).map(renderScope)}
                                                </AccordionDetails>
                                            </Accordion>
                                        ),
                                    )}
                                </Box>
                            );
                        }

                        return (
                            <Box
                                key={group}
                                sx={{ mb: 1.5, "&:last-child": { mb: 0 } }}
                            >
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.7rem",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                        mb: 0.5,
                                    }}
                                >
                                    {GROUP_LABELS[group]}
                                </Typography>
                                {options.map(renderScope)}
                            </Box>
                        );
                    })
                )}
            </Box>

            <Box
                sx={{
                    mt: 2,
                    p: 1.5,
                    border: "1px dashed var(--border)",
                    borderRadius: 2,
                }}
            >
                <Typography
                    sx={{
                        color: "var(--fg)",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        mb: 1,
                    }}
                >
                    Create a product scope
                </Typography>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                        gap: 1,
                    }}
                >
                    <TextField
                        size="small"
                        label="Scope name"
                        placeholder="product:resource:read"
                        value={draft.name}
                        onChange={(event) =>
                            setDraft({
                                ...draft,
                                name: event.target.value.toLowerCase(),
                            })
                        }
                    />
                    <TextField
                        size="small"
                        label="Consent label"
                        value={draft.label}
                        onChange={(event) =>
                            setDraft({ ...draft, label: event.target.value })
                        }
                    />
                    <TextField
                        size="small"
                        label="Plain-language description"
                        value={draft.description}
                        onChange={(event) =>
                            setDraft({
                                ...draft,
                                description: event.target.value,
                            })
                        }
                        sx={{ gridColumn: { sm: "1 / -1" } }}
                    />
                </Box>
                {error ? (
                    <Typography
                        sx={{ color: "#b91c1c", fontSize: "0.72rem", mt: 0.75 }}
                    >
                        {error}
                    </Typography>
                ) : null}
                <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={addCustomScope}
                    sx={{ mt: 1, textTransform: "none", color: "#ff7759" }}
                >
                    Add custom scope
                </Button>
            </Box>
        </Box>
    );
}
