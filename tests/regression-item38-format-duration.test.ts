/**
 * ROADMAP item 38 (Low, found in the v0.6.0 CI log): formatDuration (src/report/markdown.ts) split a duration into minutes with
 * Math.floor and rounded only the rest, so 239.6 s was shown as `3m60s`; below a minute it rounded to 0.1 s with toFixed, so 59.96 s was
 * `60.0s`. v0.7.0 rounds the whole value to the unit it is shown in before splitting (0.1 s below a minute, 1 s from a minute): a value
 * that rounds to 60.0 s is shown as `1m00s`, and the seconds of the minute form are never 60. The other values are shown as before
 * (ms below 1 s, one decimal below a minute, `<m>m<ss>s` from a minute), and only the durations at a carry change.
 */
import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/report/markdown.ts";

describe("item 38: the rounding carries into the next unit", () => {
  it.each([
    [239_600, "4m00s"],
    [119_500, "2m00s"],
    [179_500, "3m00s"],
    [59_960, "1m00s"],
    [59_950, "1m00s"],
    [3_599_500, "60m00s"],
  ])("%d ms is %s", (ms, shown) => {
    expect(formatDuration(ms)).toBe(shown);
  });

  it("no duration from 1 s to 2 h is shown as 60.0s or with 60 seconds, and the shown value is the duration rounded to its unit", () => {
    const bad: string[] = [];
    for (let ms = 1000; ms <= 7_200_000; ms += ms < 600_000 ? 1 : 7) {
      const s = formatDuration(ms);
      const sec = /^(\d+)\.(\d)s$/.exec(s);
      const min = /^(\d+)m(\d{2})s$/.exec(s);
      if (sec !== null) {
        const shown = Number(`${sec[1]}.${sec[2]}`);
        if (shown >= 60 || Math.abs(shown - ms / 1000) > 0.05 + 1e-9) bad.push(`${ms} -> ${s}`);
      } else if (min !== null) {
        const seconds = Number(min[2]);
        const shown = Number(min[1]) * 60 + seconds;
        if (seconds >= 60 || Math.abs(shown - ms / 1000) > 0.5 + 1e-9 || ms < 59_950) bad.push(`${ms} -> ${s}`);
      } else bad.push(`${ms} -> ${s}`);
      if (bad.length > 5) break;
    }
    expect(bad).toEqual([]);
  });
});

describe("item 38: the values away from a carry are shown as before", () => {
  it.each([
    [0, "0ms"],
    [999, "999ms"],
    [1000, "1.0s"],
    [1500, "1.5s"],
    [59_940, "59.9s"],
    [60_000, "1m00s"],
    [65_000, "1m05s"],
    [239_400, "3m59s"],
    [179_499, "2m59s"],
    [698_000, "11m38s"],
  ])("%d ms is %s", (ms, shown) => {
    expect(formatDuration(ms)).toBe(shown);
  });
});
