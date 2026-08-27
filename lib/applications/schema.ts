export type SavedApplicationStatus = "active" | "archived";

export interface SavedUniversityChoice {
  id: string;
  name: string;
  major?: string;
  priority: number;
}

export interface SavedApplication {
  id: string;
  version: 1;
  status: SavedApplicationStatus;
  program: "GKS-U" | "GKS-G";
  track: "embassy" | "university";
  subtype?: string;
  universities: SavedUniversityChoice[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedApplicationStore {
  version: 1;
  activeApplicationId: string | null;
  applications: SavedApplication[];
}

export interface ApplicationDashboardUniversitySummary {
  id: string;
  name: string;
  major?: string;
  priority: number;
  requiredTotal: number;
  requiredReady: number;
  requiredMissing: number;
  requiredUntracked: number;
  conditionalTotal: number;
  optionalTotal: number;
  progressPercent: number | null;
}

export interface ApplicationDashboardSummary {
  applicationId: string;
  program: SavedApplication["program"];
  track: SavedApplication["track"];
  subtype?: string;
  overall: {
    requiredTotal: number;
    requiredReady: number;
    requiredMissing: number;
    requiredUntracked: number;
    conditionalTotal: number;
    optionalTotal: number;
    progressPercent: number | null;
  };
  common: {
    requiredTotal: number;
    requiredReady: number;
    requiredMissing: number;
    requiredUntracked: number;
    progressPercent: number | null;
  };
  universities: ApplicationDashboardUniversitySummary[];
}
