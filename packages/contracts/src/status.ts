import { z } from "zod";

export const ipoStatusSchema = z.enum(["upcoming", "open", "closed", "allotment", "listed"]);

export type IpoStatus = z.infer<typeof ipoStatusSchema>;
