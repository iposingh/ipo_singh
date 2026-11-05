/**
 * Non-layout visual finish tokens: atmospheric page fills, layered surfaces,
 * and button depth. Colors only — geometry stays in components.
 */
export const finish = {
  light: {
    pageAtmosphere:
      "radial-gradient(ellipse at 88% -5%, rgba(34, 197, 94, 0.09), transparent 46%), radial-gradient(ellipse at -5% 95%, rgba(22, 163, 74, 0.05), transparent 44%), linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
    surfaceFill: "linear-gradient(180deg, #FFFFFF 0%, #FCFDFE 100%)",
    surfaceFillHover: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    borderAccent: "#E2E8F0",
    borderAccentHover: "rgba(22, 163, 74, 0.38)",
    buttonFill: "linear-gradient(135deg, #16A34A 0%, #15803D 100%)",
    buttonFillHover: "linear-gradient(135deg, #15803D 0%, #166534 100%)",
    buttonShadow: "0 4px 16px rgba(22, 163, 74, 0.22), 0 1px 0 rgba(255, 255, 255, 0.18) inset",
    headerFill: "rgba(248, 250, 252, 0.88)",
    controlFill: "#FFFFFF",
    insetHighlight: "inset 0 1px 0 rgba(255, 255, 255, 0.9)",
  },
  dark: {
    pageAtmosphere:
      "radial-gradient(ellipse at 82% -8%, rgba(34, 197, 94, 0.14), transparent 48%), radial-gradient(ellipse at 8% 100%, rgba(198, 244, 50, 0.055), transparent 46%), radial-gradient(ellipse at 50% 40%, rgba(16, 26, 32, 0.55), transparent 70%), #080B0C",
    surfaceFill: "linear-gradient(145deg, #14232A 0%, #080F1A 100%)",
    surfaceFillHover: "linear-gradient(145deg, #1B3032 0%, #101A20 100%)",
    borderAccent: "rgba(34, 197, 94, 0.18)",
    borderAccentHover: "rgba(198, 244, 50, 0.28)",
    buttonFill: "linear-gradient(135deg, #C6F432 0%, #A7E62B 100%)",
    buttonFillHover: "linear-gradient(135deg, #D4F85A 0%, #C6F432 100%)",
    buttonShadow: "0 4px 18px rgba(198, 244, 50, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.22)",
    headerFill: "rgba(8, 11, 12, 0.82)",
    controlFill: "linear-gradient(180deg, #14232A 0%, #101A20 100%)",
    insetHighlight: "inset 0 1px 0 rgba(255, 255, 255, 0.035)",
  },
} as const;
