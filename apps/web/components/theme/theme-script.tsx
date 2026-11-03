import { themeInitScript } from "@/lib/theme/theme";

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}
