import { formatIstDateTime, formatLastUpdated } from "@ipo-singh/core";

type IstDateTimeProps = {
  value: Date | null | undefined;
};

export function IstDateTime({ value }: IstDateTimeProps) {
  const text = formatIstDateTime(value);
  return <time dateTime={value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : undefined} className={text === "Unavailable" ? "text-muted" : "text-foreground"}>{text}</time>;
}

export function LastUpdated({ value }: IstDateTimeProps) {
  const text = formatLastUpdated(value);
  return <p className={text.endsWith("Unavailable") ? "text-sm text-muted" : "text-sm text-foreground"}>{text}</p>;
}
