import data from "@/data/deadlines-notices-data.json";
import type { DeadlineNoticeDataset } from "./schema";
import { matchDeadlineNoticeFeed, nextVerifiedDeadline } from "./matcher";

const dataset = data as DeadlineNoticeDataset;

export function getApplicationNotices(input: {
  program: "GKS-U" | "GKS-G";
  track?: "embassy" | "university";
  cycle?: string;
  now?: Date;
}) {
  return matchDeadlineNoticeFeed(dataset, input);
}

export function getNextApplicationDeadline(input: {
  program: "GKS-U" | "GKS-G";
  track?: "embassy" | "university";
  cycle?: string;
  now?: Date;
}) {
  return nextVerifiedDeadline(dataset, input);
}

export { dataset as deadlineNoticeDataset };
