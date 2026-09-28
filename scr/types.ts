export type Language = 'uz' | 'ru' | 'en';
export type Theme = 'light' | 'dark';

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  groupId: string;
  language: Language;
  subgroup?: string;
  pinfl?: string;
}

export interface Group {
  id: string;
  name: string;
  language?: Language;
}

export type QuestionType = 'single' | 'multiple' | 'true_false' | 'text_input' | 'matching' | 'find_on_model';

export interface Question {
  id: string;
  text: string;
  theme: string;
  language: Language;
  type: QuestionType;
  options: {
    A: string;
    B: string;
    C?: string;
    D?: string;
    E?: string;
    F?: string;
    G?: string;
    H?: string;
  };
  correctAnswer: string; // For 'multiple', this will be comma-separated values like 'A,B'. For 'find_on_model', it's the part name.
  imageUrl?: string;
  model3dUrl?: string; // For 3D integrations
  modelId?: 'skull' | 'jaw' | 'brain'; // Specific to Anatomy Quiz
  targetPart?: string; // Correct part for 'find_on_model'
  highlightPart?: string; // Specific to Anatomy Quiz
  matchingPairs?: { left: string; right: string }[]; // For matching type
}

export interface ExamResult {
  id: string;
  studentId: string;
  studentName: string;
  groupId?: string;
  groupName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  percentage: number;
  timestamp: string;
  language: Language;
  theme?: string;
}

export interface GlobalSettings {
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  antiCheatEnabled: boolean;
  timerMinutes: number;
  show3D: boolean;
  showImages: boolean;
  scheduledExams?: ScheduledExam[];
  logo?: string;
  logoType?: 'text' | 'image';
  registrationMode?: 'classic' | 'pinfl';
}

export interface ScheduledExam {
  id: string;
  theme: string;
  groupId: string; // 'all' or actual group ID
  startTime: string; // ISO string or time string
  endTime?: string;
  duration?: number;
  date: string; // YYYY-MM-DD
  isActive: boolean;
}

export type QuestionStatus = 'unanswered' | 'current' | 'correct' | 'wrong' | 'answered';

export interface ExamTheme {
  id: string;
  name: string;
}

export interface University {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  expiresAt?: string;
  logoUrl?: string;
  bgUrl?: string;
  bgType?: 'image' | 'video';
}
