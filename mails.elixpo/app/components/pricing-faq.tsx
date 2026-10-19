"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from "@mui/material";

const INK = "var(--fg)";
const SLATE = "var(--fg-muted)";
const HAIRLINE = "var(--border)";

export interface Faq {
    q: string;
    a: string;
}

export default function PricingFaq({ items }: { items: Faq[] }) {
    return (
        <Box sx={{ borderTop: `1px solid ${HAIRLINE}` }}>
            {items.map((item, i) => (
                <Accordion
                    key={item.q}
                    disableGutters
                    elevation={0}
                    defaultExpanded={i === 0}
                    sx={{
                        background: "transparent",
                        borderBottom: `1px solid ${HAIRLINE}`,
                        borderRadius: "0px !important",
                        "&:before": { display: "none" },
                    }}
                >
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon sx={{ color: SLATE }} />}
                        sx={{
                            px: 1,
                            py: 1,
                            "& .MuiAccordionSummary-content": { my: 1.5 },
                        }}
                    >
                        <Typography
                            sx={{
                                fontWeight: 500,
                                fontSize: "1.08rem",
                                color: "var(--fg)",
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            {item.q}
                        </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 1, pb: 3, pt: 0 }}>
                        <Typography
                            sx={{
                                color: INK,
                                fontSize: "0.95rem",
                                lineHeight: 1.65,
                                fontFamily: "var(--font-sans)",
                            }}
                        >
                            {item.a}
                        </Typography>
                    </AccordionDetails>
                </Accordion>
            ))}
        </Box>
    );
}
