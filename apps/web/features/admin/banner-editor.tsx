"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdCarousel } from "@/features/promotions/ad-carousel";
import type { AdSlide } from "@/features/promotions/ads";
import { readCsrfToken } from "@/features/auth/csrf";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type BannerPreview = AdSlide;

type BannerRecord = {
  id: string;
  title: string;
  description: string;
  destinationUrl: string;
  priority: number;
  status: "draft" | "active" | "archived";
  startAt: string | null;
  endAt: string | null;
  sponsored: boolean;
  disclosure: "sponsored" | "advertisement" | null;
  desktopImageId: string | null;
  mobileImageId: string | null;
  preview: BannerPreview | null;
};

function istInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

function istIso(value: string): string | null {
  if (value.length === 0) return null;
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function adminSend(path: string, method: string, body?: BodyInit, contentType?: string): Promise<{ status: number; payload: unknown }> {
  const headers = new Headers({ accept: "application/json" });
  if (contentType) headers.set("content-type", contentType);
  else if (body) headers.set("content-type", "application/json");
  const csrf = readCsrfToken(document.cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(path, { method, headers, body });
  const text = await response.text();
  if (!text) return { status: response.status, payload: null };
  try {
    return { status: response.status, payload: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, payload: null };
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

function recordFrom(payload: unknown): BannerRecord | null {
  if (!payload || typeof payload !== "object" || !("id" in payload)) return null;
  const record = payload as Partial<BannerRecord>;
  if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.description !== "string" || typeof record.destinationUrl !== "string") return null;
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    destinationUrl: record.destinationUrl,
    priority: typeof record.priority === "number" ? record.priority : 0,
    status: record.status === "active" || record.status === "archived" ? record.status : "draft",
    startAt: typeof record.startAt === "string" ? record.startAt : null,
    endAt: typeof record.endAt === "string" ? record.endAt : null,
    sponsored: record.sponsored === true,
    disclosure: record.disclosure === "sponsored" || record.disclosure === "advertisement" ? record.disclosure : null,
    desktopImageId: typeof record.desktopImageId === "string" ? record.desktopImageId : null,
    mobileImageId: typeof record.mobileImageId === "string" ? record.mobileImageId : null,
    preview: record.preview && typeof record.preview === "object" ? (record.preview as BannerPreview) : null,
  };
}

export function BannerEditor({ bannerId }: { bannerId?: string }) {
  const router = useRouter();
  const [banner, setBanner] = useState<BannerRecord | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("/ipos/mainboard");
  const [priority, setPriority] = useState("0");
  const [sponsored, setSponsored] = useState(false);
  const [disclosure, setDisclosure] = useState<"sponsored" | "advertisement">("sponsored");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!bannerId) return;
    let active = true;
    void adminSend(`/api/admin/banners/${bannerId}`, "GET").then((result) => {
      if (!active) return;
      const next = recordFrom(result.payload);
      if (!next) {
        setMessage("The banner could not be loaded.");
        return;
      }
      apply(next);
    });
    return () => {
      active = false;
    };
  }, [bannerId]);

  function apply(next: BannerRecord) {
    setBanner(next);
    setTitle(next.title);
    setDescription(next.description);
    setDestinationUrl(next.destinationUrl);
    setPriority(String(next.priority));
    setSponsored(next.sponsored);
    setDisclosure(next.disclosure ?? "sponsored");
    setStartAt(istInput(next.startAt));
    setEndAt(istInput(next.endAt));
  }

  function body() {
    const rank = Number(priority);
    return {
      title,
      description,
      destinationUrl,
      placement: "home",
      priority: Number.isInteger(rank) ? rank : -1,
      sponsored,
      disclosure: sponsored ? disclosure : null,
      startAt: istIso(startAt),
      endAt: istIso(endAt),
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await adminSend(banner ? `/api/admin/banners/${banner.id}` : "/api/admin/banners", banner ? "PATCH" : "POST", JSON.stringify(body()));
    setPending(false);
    const next = recordFrom(result.payload);
    if (!next) {
      setMessage(messageFrom(result.payload, "The banner was not saved."));
      return;
    }
    if (!banner) {
      router.push(`/admin/banners/${next.id}`);
      return;
    }
    apply(next);
    setMessage("Saved.");
  }

  async function upload(slot: "desktop" | "mobile", file: File | undefined) {
    if (!banner || !file) return;
    setPending(true);
    setMessage(null);
    const result = await adminSend(`/api/admin/banners/${banner.id}/images?slot=${slot}`, "POST", file, file.type);
    setPending(false);
    const next = recordFrom(result.payload);
    if (!next) {
      setMessage(messageFrom(result.payload, "The image was not stored."));
      return;
    }
    apply(next);
    setMessage(slot === "desktop" ? "Desktop image stored." : "Mobile image stored.");
  }

  async function act(path: string, method = "POST") {
    if (!banner) return;
    setPending(true);
    setMessage(null);
    const result = await adminSend(path, method, method === "DELETE" ? undefined : "{}");
    setPending(false);
    if (method === "DELETE" && result.status === 204) {
      router.push("/admin/banners");
      return;
    }
    const next = recordFrom(result.payload);
    if (!next) {
      setMessage(messageFrom(result.payload, "The banner was not changed."));
      return;
    }
    apply(next);
  }

  return (
    <div className="grid gap-4">
      <Card>
        <h1 className="text-xl font-semibold text-foreground">{banner ? "Edit banner" : "New banner"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">House banners stay on IPO Singh. A paid destination uses https and a Sponsored or Advertisement label. Times are Asia/Kolkata.</p>
        <form className="mt-4 grid max-w-xl gap-4" onSubmit={(event) => void save(event)}>
          <Input id="banner-title" label="Title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
          <label className="grid gap-1.5 text-sm font-medium text-foreground" htmlFor="banner-description">
            Description
            <textarea id="banner-description" value={description} maxLength={180} onChange={(event) => setDescription(event.target.value)} className="h-24 rounded-control border border-border bg-surface px-3 py-2 text-base font-normal text-foreground" />
          </label>
          <Input id="banner-destination" label="Destination URL" value={destinationUrl} maxLength={500} onChange={(event) => setDestinationUrl(event.target.value)} />
          <Input id="banner-priority" label="Priority" type="number" min={0} max={100} value={priority} onChange={(event) => setPriority(event.target.value)} hint="Higher priority is shown first." />
          <Input id="banner-start" label="Start (Asia/Kolkata)" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} hint="Leave empty to start immediately." />
          <Input id="banner-end" label="End (Asia/Kolkata)" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} hint="Leave empty for no end." />
          <label className="flex items-center gap-2 text-sm text-foreground" htmlFor="banner-sponsored">
            <input id="banner-sponsored" type="checkbox" checked={sponsored} onChange={(event) => setSponsored(event.target.checked)} />
            Sponsored
          </label>
          {sponsored ? (
            <Select
              id="banner-disclosure"
              label="Paid label"
              value={disclosure}
              onValueChange={(value) => setDisclosure(value === "advertisement" ? "advertisement" : "sponsored")}
              options={[
                { value: "sponsored", label: "Sponsored" },
                { value: "advertisement", label: "Advertisement" },
              ]}
            />
          ) : null}
          <Button type="submit" loading={pending} disabled={pending || banner?.status === "archived"}>
            Save banner
          </Button>
        </form>
      </Card>
      {banner ? (
        <Card>
          <h2 className="text-base font-semibold text-foreground">Images and publication</h2>
          <p className="mt-2 text-sm text-muted">{`Status: ${banner.status}. Desktop ${banner.desktopImageId ? "ready" : "missing"}. Mobile ${banner.mobileImageId ? "ready" : "missing"}.`}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ImageUpload label="Desktop image" disabled={pending || banner.status === "archived"} onFile={(file) => void upload("desktop", file)} />
            <ImageUpload label="Mobile image" disabled={pending || banner.status === "archived"} onFile={(file) => void upload("mobile", file)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={pending || banner.status === "archived"} onClick={() => void act(`/api/admin/banners/${banner.id}/activate`)}>
              Activate
            </Button>
            <Button type="button" variant="secondary" disabled={pending || banner.status !== "active"} onClick={() => void act(`/api/admin/banners/${banner.id}/deactivate`)}>
              Deactivate
            </Button>
            <Button type="button" variant="secondary" disabled={pending || banner.status === "archived"} onClick={() => void act(`/api/admin/banners/${banner.id}/archive`)}>
              Archive
            </Button>
            <Button type="button" variant="danger" disabled={pending || banner.status === "active"} onClick={() => void act(`/api/admin/banners/${banner.id}`, "DELETE")}>
              Delete
            </Button>
          </div>
        </Card>
      ) : null}
      {banner?.preview ? (
        <div className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">Preview</h2>
          <AdCarousel slides={[banner.preview]} />
        </div>
      ) : null}
      {message ? <p className="text-sm text-foreground" role="status">{message}</p> : null}
    </div>
  );
}

function ImageUpload({ label, disabled, onFile }: { label: string; disabled: boolean; onFile: (file: File | undefined) => void }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        className="text-sm font-normal"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
    </label>
  );
}
