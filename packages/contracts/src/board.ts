import { z } from "zod";

export const boardSchema = z.enum(["mainboard", "sme"]);

export type Board = z.infer<typeof boardSchema>;
