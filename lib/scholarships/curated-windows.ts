import { scholarshipAvailability, type ApplicationWindow } from "./availability";
import type { ScholarshipStudioRow } from "@/components/scholarships/studio-client";

/** Manually reviewed intake-specific guide entries, independent of the crawler.
 * Never renew the check date automatically. Re-review source notices before extending.
 */
type Call = { id: string; university: string; name: string; degree: "undergraduate" | "graduate"; funding: string; url: string; window: ApplicationWindow; deadlineLabel: string; applicationRequired: boolean | null };
const checked = "2026-11-26T00:00:00Z";
const smu = "https://japed.smu.ac.kr/cms/fileDownload.do?path=%2F_res%2Foia%2Fetc%2F%EC%83%81%EB%AA%85%EB%8C%80%ED%95%99%EA%B5%90%28%EC%84%9C%EC%9A%B8%29_2027%ED%95%99%EB%85%84%EB%8F%84_%EC%A0%84%EA%B8%B0_%EC%8B%A0%ED%8E%B8%EC%9E%85%ED%95%99_%EC%99%B8%EA%B5%AD%EC%9D%B8%ED%8A%B9%EB%B3%84%EC%A0%84%ED%98%95_%EB%AA%A8%EC%A7%91%EC%9A%94%EA%B0%95.pdf";
const hallym = "https://counsel.hallym.ac.kr/pdfView/iao/28/127/fileDownload.do";
const inje = "https://cms.inje.ac.kr/pharm/community/notice.do?articleNo=76911&attachNo=42505&mode=download";
const calls: Call[] = [
  { id:"curated-smu-2027-spring-r2", university:"Sangmyung University", name:"Global Admission Scholarship · Round 2", degree:"undergraduate", funding:"First-semester tuition reduction based on admission score or TOPIK; award varies by tier.", url:smu, applicationRequired:null, deadlineLabel:"27 Nov 2026, 16:00 KST", window:{opensAt:"2026-11-16T10:00:00+09:00",closesAt:"2026-11-27T16:00:00+09:00",kind:"admission",cutoffKnown:true,intake:"Spring 2027",note:"Online application and physical documents due together. Guide timeline and scholarship section; admission or funding is not guaranteed."}},
  { id:"curated-smu-2027-spring-r3", university:"Sangmyung University", name:"Global Admission Scholarship · Round 3", degree:"undergraduate", funding:"First-semester tuition reduction based on admission score or TOPIK; award varies by tier.", url:smu, applicationRequired:null, deadlineLabel:"8 Jan 2027, 16:00 KST", window:{opensAt:"2026-12-28T10:00:00+09:00",closesAt:"2027-01-08T16:00:00+09:00",kind:"admission",cutoffKnown:true,intake:"Spring 2027",note:"Published third round; reverify before the opening date. Online and original documents due together."}},
  { id:"curated-hallym-2027-spring", university:"Hallym University", name:"First-semester international student scholarship", degree:"undergraduate", funding:"English track: 50% tuition reduction. Korean track: tiered tuition reduction based on language proficiency.", url:hallym, applicationRequired:null, deadlineLabel:"18 Dec 2026, 17:00 KST",window:{opensAt:"2026-11-16T00:00:00+09:00",closesAt:"2026-12-18T17:00:00+09:00",kind:"admission",cutoffKnown:true,intake:"Spring 2027",note:"Online application closes Dec 18; required originals must arrive by Dec 24, 17:00 KST. Fourth-year transfers excluded; consult guide sections 2 and 7. Guide has inconsistent academic eligibility dates: confirm with admissions."}},
  { id:"curated-inje-2027-spring", university:"Inje University", name:"Full-time graduate tuition scholarship", degree:"graduate", funding:"Tuition waiver tiers of 50% or 85%, subject to advisor recommendation and tier-specific obligations.",url:inje,applicationRequired:true,deadlineLabel:"27 Nov 2026 · exact time not stated",window:{opensAt:"2026-11-02T00:00:00+09:00",closesAt:"2026-11-28T00:00:00+09:00",kind:"admission",cutoffKnown:false,intake:"Spring 2027",note:"Online application plus original documents due Nov 27. Exact hour is not stated. Full-time scholarship form and recommendation required; Music and Global MBA excluded. Consult guide sections I and VII."}},
];
export function curatedScholarshipRows(now: Date): ScholarshipStudioRow[] {
  return calls.map(c => {
    const row = {id:c.id, university_name:c.university, scholarship_name:c.name, scholarship_type:"Intake-linked funding · " + c.window.intake, degree_level:c.degree, benefit_type:c.funding, tuition_coverage:null, gpa_requirement:null, topik_requirement:null, application_required:c.applicationRequired, automatic_consideration:null, deadline:null, deadline_type:"admission_schedule", status:"active",is_active:true,source_url:c.url,content_hash:null,last_verified_at:checked,deadline_label:c.deadlineLabel,application_window:c.window};
    return {...row, availability:scholarshipAvailability(row,now)};
  });
}
