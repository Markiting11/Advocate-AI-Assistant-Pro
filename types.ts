
export interface Citation {
  title: string;
  uri: string;
  snippet?: string;
}

export interface CaseAnalysis {
  caseType: string;
  parties: string[];
  summary: string;
  keyFacts: string[];
  reliefSought: string;
  legalIssues: string[];
  citations?: Citation[];
}

export interface LegalStrategy {
  strengths: string[];
  risks: string[];
  gaps: string[];
  applicableLaws: string[];
  argumentFlow: string[];
}

export interface HearingPrep {
  checklist: string[];
  predictedQuestions: string[];
  opponentArguments: string[];
  counterPoints: string[];
}

export enum AppTab {
  Upload = 'Upload',
  Analysis = 'Analysis',
  Strategy = 'Strategy',
  Drafts = 'Drafts',
  HearingPrep = 'HearingPrep'
}

export type LegalDomain = 'Family' | 'Criminal' | 'Civil' | 'General';
export type DraftLanguage = 'English' | 'Urdu';

export interface CaseData {
  fileName: string;
  fileContent: string;
  analysis?: CaseAnalysis;
  strategy?: LegalStrategy;
  hearingPrep?: HearingPrep;
}
