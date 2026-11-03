"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";

export function DesignSystemControls() {
  const [query, setQuery] = useState("");
  const [board, setBoard] = useState("mainboard");

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <Button loading>Saving</Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Input id="sample-issue" label="Issue name" placeholder="Sample issue" hint="Illustrative field only." />
        <Input id="sample-issue-error" label="Lot size" defaultValue="0" error="Enter a lot size above zero." />
        <SearchInput
          id="sample-search"
          label="Search sample issues"
          value={query}
          onValueChange={setQuery}
          placeholder="Try a sample name"
          hint="This search does not look up live IPO data."
        />
        <Select
          id="sample-board"
          label="Board"
          value={board}
          onValueChange={setBoard}
          hint="Illustrative options."
          options={[
            { value: "mainboard", label: "Mainboard sample" },
            { value: "sme", label: "SME sample" },
          ]}
        />
      </div>
      <Tabs
        label="Sample issue sections"
        items={[
          { value: "overview", label: "Overview", content: "Illustrative overview copy for a sample issue." },
          { value: "dates", label: "Dates", content: "Illustrative dates. These are not a live timetable." },
          { value: "notes", label: "Notes", content: "Use the arrow keys to move between these tabs." },
        ]}
      />
      <div className="flex flex-wrap gap-3">
        <Dialog
          trigger={<Button variant="secondary">Open dialog</Button>}
          title="Sample details"
          description="This dialog is part of the design system. It does not submit or store IPO data."
        >
          <p className="text-sm leading-6 text-muted">Press Escape or the close button to dismiss it.</p>
        </Dialog>
        <Drawer
          trigger={<Button variant="secondary">Open drawer</Button>}
          title="Sample filters"
          description="Illustrative filters for the design review."
        >
          <p className="text-sm leading-6 text-muted">On a narrow screen this panel sits at the bottom.</p>
        </Drawer>
        <Tooltip content="Illustrative hint. Color is not the only status cue.">
          <Button variant="ghost">Hint</Button>
        </Tooltip>
      </div>
    </div>
  );
}
