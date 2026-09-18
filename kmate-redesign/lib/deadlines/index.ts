import data from "@/data/deadlines-notices-data.json";
import type { DeadlineNoticeDataset } from "./schema";
import { matchDeadlineNoticeFeed, nextVerifiedDeadline } from "./matcher";
import type { LiveVerifiedDeadline } from "./live-schema";

const dataset = data as DeadlineNoticeDataset;

export function getApplicationNotices(input: {
  program: "GKS-U" | "GKS-G";
  track?: "embassy" | "university";
  cycle?: string;
  now?: Date;
  /** Verified deadlines from the database. Absent = curated dataset only. */
  live?: LiveVerifiedDeadline[];
}) {
  return matchDeadlineNoticeFeed(dataset, input);
}

export function getNextApplicationDeadline(input: {
  program: "GKS-U" | "GKS-G";
  track?: "embassy" | "university";
  cycle?: string;
  now?: Date;
  live?: LiveVerifiedDeadline[];
}) {
  return nextVerifiedDeadline(dataset, input);
}

export { dataset as deadlineNoticeDataset };
