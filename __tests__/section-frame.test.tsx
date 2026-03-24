import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionFrame } from "@/components/SectionFrame";
import { daysAgo } from "@/components/dashboard-utils";

describe("SectionFrame", () => {
  it("shows a stale banner for data older than seven days", () => {
    render(
      <SectionFrame
        description="History"
        error={null}
        lastSuccessAt={daysAgo(9)}
        locale="en"
        sourceLabel="Test feed"
        title="Timeline"
      >
        <div>content</div>
      </SectionFrame>,
    );

    expect(screen.getByText(/stale/i)).toBeInTheDocument();
    expect(screen.getByText(/older than 7 days/i)).toBeInTheDocument();
  });

  it("renders the last updated label", () => {
    render(
      <SectionFrame
        description="Overview"
        error={null}
        lastSuccessAt={daysAgo(1)}
        locale="tr"
        sourceLabel="Test feed"
        title="Genel"
      >
        <div>content</div>
      </SectionFrame>,
    );

    expect(screen.getByText(/Son güncelleme/i)).toBeInTheDocument();
  });
});
