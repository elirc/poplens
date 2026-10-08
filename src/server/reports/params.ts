import { z } from "zod";

/** Custom report spec stored in custom_reports.params. */
export const MAX_REPORT_PLACES = 8;
export const MAX_REPORT_INDICATORS = 12;

const code = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/, "Invalid code");

export const reportParamsSchema = z.object({
  placeCodes: z
    .array(code)
    .min(1, "Choose at least one place")
    .max(MAX_REPORT_PLACES, `At most ${MAX_REPORT_PLACES} places`)
    .transform((a) => [...new Set(a)]),
  indicatorCodes: z
    .array(code)
    .min(1, "Choose at least one indicator")
    .max(MAX_REPORT_INDICATORS, `At most ${MAX_REPORT_INDICATORS} indicators`)
    .transform((a) => [...new Set(a)]),
  year: z.number().int().min(1950).max(2100).optional(),
});

export type ReportParams = z.infer<typeof reportParamsSchema>;

export const reportTitleSchema = z.string().trim().min(1).max(140);

export function reportFileKey(id: number): string {
  return `reports/${id}.pdf`;
}
