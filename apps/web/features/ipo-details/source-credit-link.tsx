import { isIpoGuruSource } from "@/features/ipo-details/source-credit";

export { isIpoGuruSource };

/** A normal credit link. The vendor terms ask that it not be marked nofollow or sponsored. */
export function IpoGuruCreditLink() {
  return (
    <a href="https://ipoguru.in" className="font-medium text-foreground underline">
      Data by IPO Guru
    </a>
  );
}
