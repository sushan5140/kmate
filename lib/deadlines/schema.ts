export type NoticeProgram = "GKS-U" | "GKS-G";
export type NoticeTrack = "embassy" | "university";

export interface OfficialSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  published_at: string;
}

export interface DeadlineRecord {
  id: string;
  program: NoticeProgram;
  cycle: string;
  track: NoticeTrack | null;
  scope: "application" | "post_selection" | "result" | "other";
  label: string;
  deadline: string;
  status: "verified" | "not_stated";
  source_id: string;
  notes?: string;
}

export interface NoticeRecord {
  id: string;
  program: NoticeProgram;
  cycle: string;
  track: NoticeTrack | null;
  type: "guideline" | "result" | "schedule_change" | "deadline" | "other";
  title: string;
  published_at: string;
  source_id: string;
  importance: "high" | "normal";
}

export interface DeadlineNoticeDataset {
  schema_version: string;
  generated_for_cycle: string;
  policy: {
    official_only: boolean;
    never_infer_future_cycle_dates: boolean;
    expired_deadlines_are_historical: boolean;
    country_or_university_deadlines_require_matching_official_source: boolean;
  };
  sources: OfficialSource[];
  deadlines: DeadlineRecord[];
  notices: NoticeRecord[];
}
