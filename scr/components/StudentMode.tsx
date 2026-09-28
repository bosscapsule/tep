import React, { useState, useEffect, useRef } from "react";
import {
  GraduationCap,
  RotateCw,
  ArrowRight,
  LogOut,
  Trophy,
  BookOpen,
  Globe,
  Search,
  ChevronDown,
  X,
  Timer,
  CheckCircle2,
  Clock,
  User,
  Users,
} from "lucide-react";
import { InterruptedExamSession, storage } from "../lib/storage";
import { syncService } from "../lib/syncService";
import {
  Question,
  Student,
  Group,
  Language,
  ExamResult,
  QuestionStatus,
  University,
} from "../types";
import { useTranslation } from "../i18n";
import { pinflRateLimit, security } from "../lib/security";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import { cn } from "../lib/utils";
import { Theme } from "../types";
import { Skeleton } from "./Skeleton";
import { mediaStore } from "../lib/mediaStore";

// Anatomy Quiz Components
import SideNav from "./Sidebar";
import Viewer3D from "./Viewer3D";
import QuestionArea from "./QuestionPanel";

interface Props {
  language: Language;
  setLanguage: (lang: Language) => void;
  onExit: () => void;
  theme: Theme;
  toggleTheme: () => void;
}

type Mode =
  | "connect_university"
  | "select_theme"
  | "select_group"
  | "select_student"
  | "exam"
  | "result"
  | "login_pinfl"
  | "confirm_pinfl";

export const StudentMode: React.FC<Props> = ({
  language,
  setLanguage,
  onExit,
  theme,
  toggleTheme,
}) => {
  const t = useTranslation(language);
  const settings = storage.getSettings();
  const [activeUniversity, setActiveUniversity] = useState<University | null>(() => storage.getCurrentUniversity());
  const [mode, setMode] = useState<Mode>(() => {
    const uni = storage.getCurrentUniversity();
    if (!uni) return "connect_university";
    const s = storage.getSettings();
    return s.registrationMode === "pinfl" ? "login_pinfl" : "select_theme";
  });
  const [connectKey, setConnectKey] = useState("");
  const [connectError, setConnectError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  
  const [pinflValue, setPinflValue] = useState("");
  const [pinflError, setPinflError] = useState("");
  const [pendingExam, setPendingExam] = useState<{
    theme: string;
    questions: Question[];
  } | null>(null);
  const [pendingStudent, setPendingStudent] = useState<Student | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [themes, setThemes] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>(() => {
    const uni = storage.getCurrentUniversity();
    if (!uni) return [];
    try {
      return storage.getGroups().sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }),
      );
    } catch (e) {
      return [];
    }
  });
  const [students, setStudents] = useState<Student[]>(() => {
    const uni = storage.getCurrentUniversity();
    if (!uni) return [];
    try {
      return storage.getStudents() || [];
    } catch (e) {
      return [];
    }
  });
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Exam data
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, QuestionStatus>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastResult, setLastResult] = useState<ExamResult | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finishExamRef = useRef<() => void>(() => {});
  const settingsRef = useRef(storage.getSettings());
  const restoreHandledRef = useRef(false);

  const [themeSearch, setThemeSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(true);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(true);
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(() => {
    const uni = storage.getCurrentUniversity();
    if (uni) return false; // Skip skeleton load if already connected
    return true;
  });

  const [logoSettings, setLogoSettings] = useState({
    logo: settingsRef.current.logo || "",
    logoType: settingsRef.current.logoType || "text",
  });

  useEffect(() => {
    const updatedSettings = storage.getSettings();
    setLogoSettings({
      logo: updatedSettings.logo || "",
      logoType: updatedSettings.logoType || "text",
    });
  }, [mode]);

  const [themesWithLang, setThemesWithLang] = useState<
    { name: string; lang: Language }[]
  >(() => {
    const uni = storage.getCurrentUniversity();
    if (!uni) return [];
    try {
      const allQuestions = storage.getQuestions() || [];
      const themesGrouped: { name: string; lang: Language }[] = [];
      (["ru", "uz", "en"] as Language[]).forEach((lang) => {
        const langThemes = Array.from(
          new Set(
            allQuestions.filter((q) => q && q.language === lang).map((q) => q.theme),
          ),
        ).filter(Boolean);

        langThemes.forEach((t) => themesGrouped.push({ name: t, lang }));
      });
      return themesGrouped;
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    const activeUni = storage.getCurrentUniversity();
    if (activeUni && activeUni.key) {
      // Sync from cloud
      syncService.pullUniversityData(activeUni.key).then(() => {
        try {
          setGroups(
            storage
              .getGroups()
              .sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }),
              ),
          );
          setStudents(storage.getStudents());
          const allQuestions = storage.getQuestions();

          const themesGrouped: { name: string; lang: Language }[] = [];
          (["ru", "uz", "en"] as Language[]).forEach((lang) => {
            const langThemes = Array.from(
              new Set(
                allQuestions.filter((q) => q && q.language === lang).map((q) => q.theme),
              ),
            ).filter(Boolean);

            langThemes.forEach((t) => themesGrouped.push({ name: t, lang }));
          });

          setThemesWithLang(themesGrouped);
          settingsRef.current = storage.getSettings();
        } catch (e) {
          console.error("Error updating state from synced university data:", e);
        } finally {
          setIsLoading(false);
        }
      }).catch((err) => {
        console.error("Cloud university pull failed during mount:", err);
        try {
          setGroups(
            storage
              .getGroups()
              .sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }),
              ),
          );
          setStudents(storage.getStudents());
          const allQuestions = storage.getQuestions();

          const themesGrouped: { name: string; lang: Language }[] = [];
          (["ru", "uz", "en"] as Language[]).forEach((lang) => {
            const langThemes = Array.from(
              new Set(
                allQuestions.filter((q) => q && q.language === lang).map((q) => q.theme),
              ),
            ).filter(Boolean);

            langThemes.forEach((t) => themesGrouped.push({ name: t, lang }));
          });

          setThemesWithLang(themesGrouped);
          settingsRef.current = storage.getSettings();
        } catch (e) {
          console.error("Fallback setup failed:", e);
        } finally {
          setIsLoading(false);
        }
      });
    } else {
      try {
        setGroups(
          storage
            .getGroups()
            .sort((a, b) =>
              (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }),
            ),
        );
        setStudents(storage.getStudents());
        const allQuestions = storage.getQuestions();

        // Group themes by language
        const themesGrouped: { name: string; lang: Language }[] = [];
        (["ru", "uz", "en"] as Language[]).forEach((lang) => {
          const langThemes = Array.from(
            new Set(
              allQuestions.filter((q) => q && q.language === lang).map((q) => q.theme),
            ),
          ).filter(Boolean);

          langThemes.forEach((t) => themesGrouped.push({ name: t, lang }));
        });

        setThemesWithLang(themesGrouped);
        settingsRef.current = storage.getSettings();
      } catch (e) {
        console.error("Local initialization failed:", e);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (restoreHandledRef.current) return;
    restoreHandledRef.current = true;

    const session = storage.getInterruptedExamSession();
    if (!session) return;

    const shouldRestore = window.confirm(
      language === "ru"
        ? "Обнаружен экзамен, прерванный из-за сбоя приложения. Восстановить его?"
        : language === "uz"
          ? "Ilova xatosi sabab to'xtatilgan imtihon topildi. Uni tiklaysizmi?"
          : "An exam interrupted by an application failure was found. Restore it?",
    );

    if (!shouldRestore) {
      storage.clearInterruptedExamSession();
      return;
    }

    setExamQuestions(session.questions);
    setCurrentQuestionIdx(session.currentQuestionIdx);
    setStatuses(session.statuses as Record<string, QuestionStatus>);
    setAnswers(session.answers);
    setTimeLeft(session.timeLeft);
    setSelectedStudent(session.student);
    setSelectedTheme(session.theme);
    setSelectedGroup(session.groupId);
    setLanguage(session.language);
    setMode("exam");

    timerRef.current = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          finishExamRef.current();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  }, [language, setLanguage]);

  useEffect(() => {
    if (mode !== "exam" || !selectedStudent || examQuestions.length === 0) return;

    const session: InterruptedExamSession = {
      questions: examQuestions,
      currentQuestionIdx,
      statuses,
      answers,
      timeLeft,
      student: selectedStudent,
      theme: selectedTheme,
      groupId: selectedGroup,
      language,
      savedAt: new Date().toISOString(),
    };
    storage.saveInterruptedExamSession(session);
  }, [mode, examQuestions, currentQuestionIdx, statuses, answers, timeLeft, selectedStudent, selectedTheme, selectedGroup, language]);

  useEffect(() => {
    if (mode !== "exam" || !settingsRef.current.antiCheatEnabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const confirmExit = confirm(
          "Внимание! Переключение вкладок запрещено во время экзамена. Ваш результат будет аннулирован. Вы уверены?",
        );
        if (confirmExit) {
          handleFinishExam();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [mode]);

  useEffect(() => {
    if (selectedGroup) {
      const group = groups.find((g) => g.id === selectedGroup);
      if (!selectedStudent && group?.language) setLanguage(group.language);
    }
  }, [selectedGroup, selectedStudent, groups, setLanguage]);

  useEffect(() => {
    if (selectedStudent?.language) {
      setLanguage(selectedStudent.language);
    }
  }, [selectedStudent, setLanguage]);

  const [resultsTimer, setResultsTimer] = useState(20);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (mode === "result" && resultsTimer > 0) {
      interval = setInterval(() => {
        setResultsTimer((prev) => prev - 1);
      }, 1000);
    } else if (mode === "result" && resultsTimer === 0) {
      handleReset();
    }

    // Confetti for 100%
    if (
      mode === "result" &&
      lastResult?.percentage === 100 &&
      resultsTimer === 20
    ) {
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) =>
        Math.random() * (max - min) + min;

      const interval: any = setInterval(function () {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);
    }

    return () => clearInterval(interval);
  }, [mode, resultsTimer]);

  const handleHeaderExit = () => {
    const activeUni = storage.getCurrentUniversity();
    const s = storage.getSettings();
    if (s.registrationMode === "pinfl") {
      storage.clearInterruptedExamSession();
      onExit();
    } else {
      const startMode = "select_theme";
      if (mode === startMode || mode === "confirm_pinfl" || mode === "login_pinfl" || mode === "connect_university" || !activeUni) {
        onExit();
      } else {
        handleReset();
      }
    }
  };

  const handleReset = () => {
    storage.clearInterruptedExamSession();
    const s = storage.getSettings();
    const startMode =
      s.registrationMode === "pinfl" ? "login_pinfl" : "select_theme";
    setMode(startMode);
    setSelectedTheme("");
    setSelectedStudent(null);
    setSelectedGroup("");
    setAnswers({});
    setPinflValue("");
    setPinflError("");
    setResultsTimer(20);
    setThemeSearch("");
    setGroupSearch("");
    setStudentSearch("");
    setIsThemeDropdownOpen(true);
    setIsGroupDropdownOpen(true);
    setIsStudentDropdownOpen(true);
  };

  useEffect(() => {
    if (mode === "select_theme") setIsThemeDropdownOpen(true);
    if (mode === "select_group") setIsGroupDropdownOpen(true);
    if (mode === "select_student") setIsStudentDropdownOpen(true);
  }, [mode]);

  const handlePinflLogin = () => {
    const limit = pinflRateLimit.canAttempt();
    if (!limit.allowed) {
      const seconds = Math.ceil(limit.waitMs / 1000);
      setPinflError(`Слишком много попыток. Подождите ${seconds} сек.`);
      return;
    }

    if (pinflValue.length !== 14) {
      setPinflError("Введите 14 цифр ПИНФЛ");
      return;
    }

    const student = students.find((s) => s.pinfl === pinflValue);
    if (!student) {
      pinflRateLimit.recordFailure();
      setPinflError("Студент с таким ПИНФЛ не найден");
      return;
    }

    pinflRateLimit.reset();

    // Found student, now find active scheduled exam
    const settings = storage.getSettings();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const activeExams = (settings.scheduledExams || []).filter((exam) => {
      if (!exam.isActive || exam.date !== todayStr) return false;
      const [exH, exM] = exam.startTime.split(":").map(Number);
      const examStartTime = exH * 60 + exM;
      const examEndTime = examStartTime + (exam.duration || 480);

      const isForStudentGroup =
        exam.groupId === "all" || exam.groupId === student.groupId;
      return (
        isForStudentGroup &&
        currentTime >= examStartTime &&
        currentTime <= examEndTime
      );
    });

    if (activeExams.length === 0) {
      setPinflError("Для вашей группы сейчас нет активных экзаменов");
      return;
    }

    // Pick first active exam
    const exam = activeExams[0];

    // A student's language has priority; old records fall back to the group language.
    const group = groups.find((g) => g.id === student.groupId);
    const studentLanguage = student.language || group?.language || language;
    setLanguage(studentLanguage);

    const questions = storage
      .getQuestions()
      .filter(
        (q) =>
          q.theme === exam.theme &&
          q.language === studentLanguage,
      );

    if (questions.length === 0) {
      setPinflError(`Нет вопросов для темы "${exam.theme}"`);
      return;
    }

    setPendingStudent(student);
    setPendingExam({ theme: exam.theme, questions });
    setMode("confirm_pinfl");
  };

  const handleConnectUniversity = async () => {
    if (!connectKey.trim()) {
      setConnectError(language === "ru" ? "Введите ключ университета" : "Universitet kalitini kiriting");
      return;
    }

    setIsConnecting(true);
    setConnectError("");

    try {
      let unis: University[] = [];
      try {
        unis = await syncService.pullUniversities();
      } catch (err) {
        console.warn("Could not pull universities from cloud, checking local:", err);
      }
      
      // Fallback: merge with local universities to be absolutely sure
      const localUnis = storage.getUniversities() || [];
      localUnis.forEach((lu) => {
        if (lu && typeof lu.key === "string") {
          const alreadyExists = unis.some(
            (u) => u && typeof u.key === "string" && u.key.toUpperCase() === lu.key.toUpperCase()
          );
          if (!alreadyExists) {
            unis.push(lu);
          }
        }
      });

      const matched = unis.find(
        (u) => u && typeof u.key === "string" && u.key.toUpperCase() === connectKey.trim().toUpperCase()
      );
      if (matched) {
        if (matched.expiresAt && new Date(matched.expiresAt).getTime() < Date.now()) {
          setConnectError(
            language === "ru"
              ? "Срок действия ключа университета истек"
              : language === "uz"
                ? "Universitet kalitining amal qilish muddati tugagan"
                : "The university key has expired",
          );
          return;
        }

        // Also save to local universities list so it's always cached and available offline
        const localUnis = storage.getUniversities() || [];
        if (!localUnis.some(u => u && (u.id === matched.id || u.key.toUpperCase() === matched.key.toUpperCase()))) {
          storage.saveUniversities([...localUnis, matched]);
        }

        storage.setCurrentUniversity(matched);
        setActiveUniversity(matched);
        
        // Fetch university data
        const syncRes = await syncService.pullUniversityData(matched.key);
        if (!syncRes || !syncRes.success) {
          console.warn("University data is unavailable; keeping the current local cache.");
        }
        
        // Refresh local items
        setGroups(
          storage
            .getGroups()
            .sort((a, b) =>
              (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }),
            ),
        );
        setStudents(storage.getStudents());
        
        const allQuestions = storage.getQuestions();
        const themesGrouped: { name: string; lang: Language }[] = [];
        (["ru", "uz", "en"] as Language[]).forEach((lang) => {
          const langThemes = Array.from(
            new Set(
              allQuestions.filter((q) => q && q.language === lang).map((q) => q.theme),
            ),
          ).filter(Boolean);

          langThemes.forEach((t) => themesGrouped.push({ name: t, lang }));
        });
        setThemesWithLang(themesGrouped);

        const activeSettings = storage.getSettings();
        setMode(activeSettings.registrationMode === "pinfl" ? "login_pinfl" : "select_theme");
      } else {
        setConnectError(language === "ru" ? "Университет с таким ключом не найден в системе" : "Bunday kalitli universitet tizimda topilmadi");
      }
    } catch (err) {
      console.error(err);
      setConnectError(language === "ru" ? "Ошибка подключения. Проверьте сеть." : "Ulanish xatosi. Tarmoqni tekshiring.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartFromConfirm = () => {
    if (pendingStudent && pendingExam) {
      setSelectedStudent(pendingStudent);
      setSelectedTheme(pendingExam.theme);
      startExamWithData(
        pendingStudent,
        pendingExam.theme,
        pendingExam.questions,
      );
    }
  };

  const startExamWithData = (
    student: Student,
    themeName: string,
    questions: Question[],
  ) => {
    storage.clearInterruptedExamSession();
    const s = storage.getSettings();
    let processed = [...questions];

    if (s.randomizeQuestions) {
      processed = processed.sort(() => Math.random() - 0.5);
    }

    setExamQuestions(processed.slice(0, 25));
    setCurrentQuestionIdx(0);
    setAnswers({});
    setStatuses({});

    setTimeLeft(s.timerMinutes * 60);
    setMode("exam");

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishExamRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleStartExam = () => {
    const group = groups.find((g) => g.id === selectedStudent?.groupId);
    const examLanguage = selectedStudent?.language || group?.language || language;
    const allQuestions = storage
      .getQuestions()
      .filter((q) => q.theme === selectedTheme && q.language === examLanguage);
    if (allQuestions.length === 0) {
      alert("No questions found for this theme and language");
      return;
    }

    const s = settingsRef.current;
    storage.clearInterruptedExamSession();
    let processed = [...allQuestions];

    // Shuffle strictly within the selected theme questions
    if (s.randomizeQuestions) {
      processed = processed.sort(() => Math.random() - 0.5);
    }

    setExamQuestions(processed.slice(0, 25)); // Optional: user mentioned 25 questions
    setCurrentQuestionIdx(0);
    setAnswers({});
    setStatuses({});

    setTimeLeft(s.timerMinutes * 60);
    setMode("exam");

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleFinishExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleFinishExam = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    storage.clearInterruptedExamSession();

    let correctCount = 0;
    examQuestions.forEach((q) => {
      const expectedAnswer = q.type === "find_on_model"
        ? (q.targetPart || q.correctAnswer)
        : q.correctAnswer;
      if (answers[q.id] === expectedAnswer) {
        correctCount++;
      }
    });

    const total = examQuestions.length;
    const percentage = Math.round((correctCount / total) * 100);

    const result: ExamResult = {
      id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      studentId: selectedStudent?.id || "",
      studentName: `${selectedStudent?.firstName} ${selectedStudent?.lastName}`,
      groupId: selectedStudent?.groupId || "",
      groupName:
        groups.find((g) => g.id === selectedStudent?.groupId)?.name || "",
      score: correctCount,
      totalQuestions: total,
      correctAnswers: correctCount,
      incorrectAnswers: total - correctCount,
      percentage,
      timestamp: new Date().toISOString(),
      language,
      theme: selectedTheme,
    };

    storage.addResult(result);
    
    const activeUni = storage.getCurrentUniversity();
    if (activeUni && activeUni.key) {
      syncService.uploadStudentResult(activeUni.key, result);
    }

    setLastResult(result);
    setMode("result");
  };

  finishExamRef.current = handleFinishExam;

  const currentQuestion = examQuestions[currentQuestionIdx] || null;
  const [resolvedImageUrl, setResolvedImageUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    void mediaStore.resolve(currentQuestion?.imageUrl).then((url) => {
      if (!cancelled) setResolvedImageUrl(url);
    });
    return () => { cancelled = true; };
  }, [currentQuestion?.imageUrl]);

  const is3DActive = !!(
    currentQuestion &&
    (settingsRef.current.show3D || currentQuestion.type === "find_on_model") &&
    currentQuestion.modelId
  );
  const isPhotoActive = !!(
    currentQuestion &&
    settingsRef.current.showImages &&
    resolvedImageUrl
  );
  const isMediaActive = is3DActive;

  const handleSelectAnswer = (ansId: string) => {
    if (!currentQuestion) return;
    if (currentQuestion.type === "multiple") {
      setAnswers((prev) => {
        const current = prev[currentQuestion.id] || "";
        const selected = current ? current.split(",") : [];
        const index = selected.indexOf(ansId);

        let next: string[];
        if (index > -1) {
          next = selected.filter((a) => a !== ansId);
        } else {
          next = [...selected, ansId].sort();
        }

        const nextVal = next.join(",");
        setStatuses((sPrev) => ({
          ...sPrev,
          [currentQuestion.id]: nextVal ? "answered" : "unanswered",
        }));
        return { ...prev, [currentQuestion.id]: nextVal };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: ansId }));
      setStatuses((prev) => ({ ...prev, [currentQuestion.id]: "answered" }));
    }
  };

  const filteredStudents = students.filter((s) => s.groupId === selectedGroup);
  const filteredThemes = themesWithLang.filter((item) =>
    item.name.toLowerCase().includes(themeSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-bento-bg text-bento-text-main flex flex-col font-sans overflow-hidden transition-colors duration-300">
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
          <Skeleton className="w-64 h-12 rounded-2xl" />
          <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-[32px]" />
            ))}
          </div>
        </div>
      ) : mode === "exam" ? (
        !currentQuestion ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
            <GraduationCap size={48} className="text-indigo-500 animate-pulse" />
            <p className="text-sm font-bold text-zinc-500">
              {language === 'uz' ? 'Savollar yuklanmoqda...' : language === 'ru' ? 'Загрузка вопросов...' : 'Loading questions...'}
            </p>
          </div>
        ) : (
          <div className="w-full h-screen bg-bento-bg flex min-h-0 overflow-hidden selection:bg-indigo-500/30 overflow-x-hidden">
          <SideNav
            user={{
              id: selectedStudent?.id,
              name: `${selectedStudent?.firstName} ${selectedStudent?.lastName}`,
              group:
                groups.find((g) => g.id === selectedStudent?.groupId)?.name ||
                "",
              subgroup: selectedStudent?.subgroup || "",
              avatar: "",
              isLegend:
                selectedStudent?.id && selectedTheme && selectedGroup
                  ? storage.getResults().some((r) => {
                      const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
                      const isRecent =
                        Date.now() - new Date(r.timestamp).getTime() <
                        ONE_MONTH;
                      return (
                        r.studentId === selectedStudent.id &&
                        r.groupId === selectedStudent.groupId &&
                        r.percentage === 100 &&
                        r.theme === selectedTheme &&
                        isRecent
                      );
                    })
                  : false,
            }}
            questions={examQuestions}
            currentQuestionId={currentQuestion.id}
            onSelectQuestion={(id) => {
              const idx = examQuestions.findIndex((q) => q.id === id);
              if (idx !== -1) setCurrentQuestionIdx(idx);
            }}
            statuses={statuses}
            onFinish={handleFinishExam}
            timeRemaining={timeLeft}
            theme={theme}
            language={language}
          />

          <div
            className={cn(
              "flex-1 flex min-h-0 overflow-hidden transition-none relative",
              is3DActive
                ? "flex-row"
                : "flex-col items-stretch justify-center bg-bento-bg overflow-hidden p-0",
            )}
          >
            <div
              className={cn(
                "transition-all duration-500 flex min-w-0 min-h-0 w-full overflow-y-auto overflow-x-hidden",
                isMediaActive ? "flex-col flex-1 relative" : "w-full flex-1 min-h-0 flex-col items-center justify-center",
              )}
            >
              {isMediaActive ? (
                <div className={cn(
                  "w-full max-w-[760px] mx-auto flex-1 overflow-hidden flex flex-col min-h-0",
                )}>
                  {is3DActive && (
                    <div
                      className={cn(
                        "w-full relative overflow-hidden transition-all duration-500 bg-white",
                        "flex-1 min-h-[260px] bg-zinc-50 dark:bg-zinc-900"
                      )}
                    >
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentQuestion.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex gap-3 p-3 flex-col"
                        >
                          <Viewer3D
                            activeModel={
                              currentQuestion.modelId as string
                            }
                            highlightPart={
                              currentQuestion.type === "find_on_model"
                                ? (answers[currentQuestion.id] || currentQuestion.highlightPart || "")
                                : (currentQuestion.highlightPart || "")
                            }
                            onModelChange={() => {}}
                            onPartClick={(part) => {
                              if (currentQuestion.type === "find_on_model") {
                                handleSelectAnswer(part);
                              }
                            }}
                            language={language}
                            theme={theme}
                            studentMode
                          />
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  )}

                  <div className={cn(
                    "border-t",
                    theme === 'dark' ? "bg-zinc-900 border-zinc-700" : "bg-white border-[#d9dee4]",
                  )}>
                    <QuestionArea
                      question={{
                        ...currentQuestion,
                        imageUrl: isPhotoActive ? resolvedImageUrl : undefined,
                        id: (currentQuestionIdx + 1).toString(),
                      }}
                      selectedAnswerId={answers[currentQuestion.id] || null}
                      onSelectAnswer={handleSelectAnswer}
                      status={statuses[currentQuestion.id] || "unanswered"}
                      onNext={() =>
                        currentQuestionIdx < examQuestions.length - 1 &&
                        setCurrentQuestionIdx((prev) => prev + 1)
                      }
                      onPrev={() =>
                        currentQuestionIdx > 0 &&
                        setCurrentQuestionIdx((prev) => prev - 1)
                      }
                      onFinish={handleFinishExam}
                      hasAnswerSelected={!!statuses[currentQuestion.id]}
                      canNext={currentQuestionIdx < examQuestions.length - 1}
                      canPrev={currentQuestionIdx > 0}
                      isCentered={false}
                      zoom={1}
                      theme={theme}
                      language={language}
                      className={cn(
                        "w-full !border-none !h-auto !p-4 shadow-none rounded-none border-0",
                        theme === 'dark' ? "!bg-zinc-900" : "!bg-white",
                        "flex-1 min-w-0"
                      )}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 min-h-0 w-full flex-col">
                  <div
                    className={cn(
                      "w-full max-w-[760px] mx-auto relative overflow-hidden transition-all duration-500 rounded-3xl shrink-0",
                      is3DActive
                        ? "h-full flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-900"
                        : "hidden",
                    )}
                  >
                    <AnimatePresence mode="wait">
                      {isMediaActive ? (
                        <motion.div
                          key={currentQuestion.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={cn(
                            "absolute inset-0 flex gap-3 p-3",
                            is3DActive && isPhotoActive ? "flex-col md:flex-row" : "flex-col"
                          )}
                        >
                          {is3DActive && (
                            <Viewer3D
                              activeModel={
                                currentQuestion.modelId as string
                              }
                              highlightPart={
                                currentQuestion.type === "find_on_model"
                                  ? (answers[currentQuestion.id] || currentQuestion.highlightPart || "")
                                  : (currentQuestion.highlightPart || "")
                              }
                              onModelChange={() => {}}
                              onPartClick={(part) => {
                                if (currentQuestion.type === "find_on_model") {
                                  handleSelectAnswer(part);
                                }
                              }}
                              language={language}
                              theme={theme}
                              studentMode
                            />
                          )}
                        </motion.div>
                      ) : (
                        <motion.div
                          key={`none-${currentQuestion.id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 flex items-center justify-center p-12 opacity-50 select-none"
                        >
                          <div className="text-center space-y-4">
                            <div className="w-20 h-20 bg-zinc-500/10 rounded-full flex items-center justify-center mx-auto grayscale">
                              <GraduationCap size={40} className="text-zinc-500" />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                              Визуализация отключена
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <QuestionArea
                    question={{
                      ...currentQuestion,
                      imageUrl: isPhotoActive ? resolvedImageUrl : undefined,
                      id: (currentQuestionIdx + 1).toString(),
                    }}
                    selectedAnswerId={answers[currentQuestion.id] || null}
                    onSelectAnswer={handleSelectAnswer}
                    status={statuses[currentQuestion.id] || "unanswered"}
                    onNext={() =>
                      currentQuestionIdx < examQuestions.length - 1 &&
                      setCurrentQuestionIdx((prev) => prev + 1)
                    }
                    onPrev={() =>
                      currentQuestionIdx > 0 &&
                      setCurrentQuestionIdx((prev) => prev - 1)
                    }
                    onFinish={handleFinishExam}
                    hasAnswerSelected={!!statuses[currentQuestion.id]}
                    canNext={currentQuestionIdx < examQuestions.length - 1}
                    canPrev={currentQuestionIdx > 0}
                    isCentered={true}
                    zoom={1}
                    theme={theme}
                    language={language}
                    className={cn(
                      "transition-all duration-500 w-full flex-1 min-h-0",
                      "!bg-transparent !border-none !p-0 shadow-none"
                    )}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        )
      ) : (
        <>
          <header className="relative bg-bento-card border-b border-bento-border px-6 py-4 flex justify-between items-center sticky top-0 z-10">
            <div className="flex items-center gap-3">
              {logoSettings.logoType === "image" && logoSettings.logo ? (
                <img
                  src={logoSettings.logo}
                  alt="Logo"
                  className="h-10 w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <>
                  <div className="bg-bento-accent p-2 rounded-lg text-white">
                    <GraduationCap size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-black text-lg text-bento-text-main tracking-tight leading-none">
                      {logoSettings.logo || ""}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <LanguageSelector
                currentLanguage={language}
                onLanguageChange={setLanguage}
                className="bg-bento-bg/50"
              />
              <ThemeToggle
                theme={theme}
                toggle={toggleTheme}
                className="h-[43px] w-[43px]"
              />

              <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

              <button
                onClick={handleHeaderExit}
                className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                title={
                  mode ===
                  (settingsRef.current.registrationMode === "pinfl"
                    ? "login_pinfl"
                    : "select_theme")
                    ? t.logout
                    : t.back
                }
              >
                <LogOut size={20} />
              </button>
            </div>
          </header>

          <main className="flex-1 flex items-center justify-center p-4 bg-bento-bg overflow-y-auto min-h-0 relative">
            <AnimatePresence mode="wait">
              {mode === "confirm_pinfl" && pendingStudent && pendingExam && (
                <motion.div
                  key="confirm-pinfl"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
                  className="w-[576px] max-w-full mx-auto"
                >
                  <div className="bg-bento-card rounded-[40px] border border-bento-border dark:border-white/5 p-6 md:p-8 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.15)] dark:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.4)] relative overflow-hidden group h-[576px] flex flex-col justify-between">
                    {/* Atmospheric Glows */}
                    <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full -mr-40 -mt-40 blur-[100px] pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 dark:bg-purple-500/20 rounded-full -ml-40 -mb-40 blur-[100px] pointer-events-none" />

                    <div className="relative z-10 flex flex-col items-center h-full justify-between w-full">
                      <motion.div
                        initial={{ rotate: -10, scale: 0.8 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: "spring", damping: 10 }}
                        className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-[24px] flex items-center justify-center text-white shadow-2xl shadow-indigo-500/40"
                      >
                        <GraduationCap size={32} />
                      </motion.div>

                      <div className="text-center mt-2">
                        <h2
                          className={cn(
                            "text-2xl font-black tracking-tight mb-1",
                            theme === "dark" ? "text-white" : "text-zinc-900",
                          )}
                        >
                          Личная карточка
                        </h2>
                        <div className="h-1 w-12 bg-indigo-500 rounded-full mx-auto" />
                      </div>

                      <div className="w-full space-y-3 my-auto text-left py-4">
                        {/* Student Name */}
                        <div
                          className={cn(
                            "p-4 rounded-[24px] border flex items-center gap-4 group/item transition-all",
                            theme === "dark"
                              ? "bg-black/60 border-white/20 text-white shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)] shadow-sm"
                              : "bg-zinc-50/50 border-zinc-200 text-zinc-900 shadow-sm",
                          )}
                        >
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-white/10 flex items-center justify-center text-indigo-600 shadow-sm">
                            <User size={20} />
                          </div>
                          <div>
                            <p
                              className={cn(
                                "text-[9px] font-black uppercase tracking-widest mb-0.5 whitespace-nowrap",
                                theme === "dark"
                                  ? "text-white/60"
                                  : "text-zinc-400",
                              )}
                            >
                              Ф.И.О Студента
                            </p>
                            <p
                              className={cn(
                                "text-lg font-black leading-tight",
                                theme === "dark"
                                  ? "text-white"
                                  : "text-zinc-900",
                              )}
                            >
                              {pendingStudent.firstName}{" "}
                              {pendingStudent.lastName}
                            </p>
                          </div>
                        </div>

                        {/* Group and Subgroup */}
                        <div className="grid grid-cols-2 gap-3">
                          <div
                            className={cn(
                              "p-4 rounded-[24px] border flex flex-col gap-1 transition-all",
                              theme === "dark"
                                ? "bg-black/60 border-white/20 text-white shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)] shadow-sm"
                                : "bg-zinc-50/50 border-zinc-200 text-zinc-900 shadow-sm",
                            )}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Users size={12} className="text-indigo-500" />
                              <p
                                className={cn(
                                  "text-[9px] font-black uppercase tracking-widest",
                                  theme === "dark"
                                    ? "text-white/60"
                                    : "text-zinc-400",
                                )}
                              >
                                Группа
                              </p>
                            </div>
                            <p
                              className={cn(
                                "text-lg font-black",
                                theme === "dark"
                                  ? "text-white"
                                  : "text-zinc-900",
                              )}
                            >
                              {groups.find(
                                (g) => g.id === pendingStudent.groupId,
                              )?.name || "N/A"}
                            </p>
                          </div>
                          <div
                            className={cn(
                              "p-4 rounded-[24px] border flex flex-col gap-1 transition-all",
                              theme === "dark"
                                ? "bg-black/60 border-white/20 text-white shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)] shadow-sm"
                                : "bg-zinc-50/50 border-zinc-200 text-zinc-900 shadow-sm",
                            )}
                          >
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <RotateCw size={12} className="text-purple-500" />
                              <p
                                className={cn(
                                  "text-[9px] font-black uppercase tracking-widest",
                                  theme === "dark"
                                    ? "text-white/60"
                                    : "text-zinc-400",
                                )}
                              >
                                Подгруппа
                              </p>
                            </div>
                            <p
                              className={cn(
                                "text-lg font-black",
                                theme === "dark"
                                  ? "text-white"
                                  : "text-zinc-900",
                              )}
                            >
                              {pendingStudent.subgroup || "A"}
                            </p>
                          </div>
                        </div>

                        {/* Theme Card */}
                        <div className="bg-indigo-600 dark:bg-indigo-900/60 p-6 rounded-[32px] text-white shadow-xl shadow-indigo-600/15 dark:shadow-none border border-transparent dark:border-white/10 relative overflow-hidden">
                          <BookOpen
                            size={90}
                            className="absolute -right-6 -bottom-6 text-white/10 dark:text-white/5 rotate-12"
                          />
                          <div className="relative z-10 w-full">
                            <p className="text-[10px] font-black text-indigo-200 dark:text-white uppercase tracking-[0.15em] mb-1">
                              Текущая тема экзамена
                            </p>
                            <p className="text-xl font-black mb-4 leading-tight dark:text-white truncate">
                              {pendingExam.theme}
                            </p>
                            <div className="flex items-center gap-4 text-indigo-100 dark:text-white">
                              <div className="flex items-center gap-1.5">
                                <Timer
                                  size={14}
                                  className="text-indigo-300 dark:text-white"
                                />
                                <span className="text-xs font-bold">
                                  {settings.timerMinutes} мин
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2
                                  size={14}
                                  className="text-indigo-300 dark:text-white"
                                />
                                <span className="text-xs font-bold">
                                  {pendingExam.questions.length} вопросов
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="w-full">
                        <button
                          onClick={handleStartFromConfirm}
                          className="w-full h-16 bg-indigo-600 dark:bg-indigo-700 text-white rounded-[24px] font-black text-xl uppercase tracking-widest shadow-[0_15px_30px_-5px_rgba(79,70,229,0.4)] hover:shadow-[0_20px_40px_-5px_rgba(79,70,229,0.5)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 flex items-center justify-center gap-3 group"
                        >
                          Начать тест
                          <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform duration-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {mode === "connect_university" && (
                <motion.div
                  key="connect-university"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
                  className="w-[576px] max-w-full"
                >
                  <div className="bg-bento-card rounded-[32px] border border-bento-border dark:border-white/5 p-8 md:p-10 text-center shadow-2xl relative overflow-hidden h-[576px] flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />

                    <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-indigo-500/20 shadow-xl relative z-10 shrink-0">
                      <BookOpen size={32} />
                    </div>

                    <div className="my-auto py-6 relative z-10 w-full">
                      <h2
                        className={cn(
                          "text-3xl font-black mb-2 drop-shadow-lg",
                          theme === "dark" ? "text-white" : "text-zinc-900",
                        )}
                      >
                        {language === "ru" ? "Подключение ВУЗа" : "Universitetni ulash"}
                      </h2>
                      <p className="text-zinc-500 dark:text-zinc-300 text-xs font-bold uppercase tracking-widest mb-8 px-4 leading-relaxed">
                        {language === "ru" 
                          ? "Для прохождения тестирования на данном компьютере необходимо подключить его к вашему ВУЗу с помощью уникального ключа" 
                          : "Ushbu kompyuterda test topshirish uchun uni universitetingizning maxsus kaliti yordamida tizimga ulash lozim"}
                      </p>

                      <div className="relative group w-full max-w-[420px] mx-auto">
                        <input
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          value={connectKey}
                          onChange={(e) => {
                            setConnectKey(e.target.value.toUpperCase());
                            setConnectError("");
                          }}
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleConnectUniversity()
                          }
                          placeholder={language === "ru" ? "ВВЕДИТЕ КЛЮЧ ВУЗа" : "OTM KALITINI KIRITING"}
                          className={cn(
                            "w-full px-6 py-4 text-lg font-bold text-center outline-none transition-all rounded-2xl border-2 uppercase",
                            theme === "dark"
                              ? "bg-black/60 border-white/20 text-white placeholder:text-zinc-700 shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)]"
                              : "bg-white border-zinc-100 text-zinc-900 placeholder:text-zinc-300 shadow-[0_4px_12px_rgba(0,0,0,0.05)]",
                            "focus:border-zinc-400 dark:focus:border-zinc-500",
                            connectError && "border-red-500 focus:border-red-500",
                          )}
                          disabled={isConnecting}
                        />
                        {connectError && (
                          <p className="mt-2 text-red-500 text-[10px] font-black uppercase tracking-widest">
                            {connectError}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 w-full shrink-0">
                      <button
                        onClick={handleConnectUniversity}
                        disabled={isConnecting}
                        className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isConnecting ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>{language === "ru" ? "Синхронизация..." : "Sinxronizatsiya..."}</span>
                          </>
                        ) : (
                          <span>{language === "ru" ? "Зарегистрировать компьютер" : "Kompyuterni ro'yxatdan o'tkazish"}</span>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {mode === "login_pinfl" && (
                <motion.div
                  key="login-pinfl"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
                  className="w-[576px] max-w-full"
                >
                  <div className="bg-bento-card rounded-[32px] border border-bento-border dark:border-white/5 p-8 md:p-10 text-center shadow-2xl relative overflow-hidden h-[576px] flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />

                    <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto shadow-indigo-500/20 shadow-xl relative z-10 shrink-0">
                      <GraduationCap size={32} />
                    </div>

                    <div className="my-auto py-6 relative z-10 w-full">
                      <h2
                        className={cn(
                          "text-3xl font-black mb-2 drop-shadow-lg",
                          theme === "dark" ? "text-white" : "text-zinc-900",
                        )}
                      >
                        Вход в систему
                      </h2>
                      <p className="text-zinc-500 dark:text-zinc-300 text-xs font-bold uppercase tracking-widest mb-8">
                        Введите ваш ПИНФЛ для начала теста
                      </p>

                      <div className="relative group w-full max-w-[420px] mx-auto">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          value={pinflValue}
                          onChange={(e) => {
                            setPinflValue(
                              e.target.value.replace(/\D/g, "").slice(0, 14),
                            );
                            setPinflError("");
                          }}
                          onKeyDown={(e) =>
                            e.key === "Enter" && handlePinflLogin()
                          }
                          placeholder="00000000000000"
                          maxLength={14}
                          className={cn(
                            "w-full px-6 py-4 text-xl font-bold text-center font-mono tabular-nums outline-none transition-all rounded-2xl border-2",
                            theme === "dark"
                              ? "bg-black/60 border-white/20 text-white placeholder:text-zinc-700 shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)]"
                              : "bg-white border-zinc-100 text-zinc-900 placeholder:text-zinc-300 shadow-[0_4px_12px_rgba(0,0,0,0.05)]",
                            "focus:border-zinc-400 dark:focus:border-zinc-500",
                            pinflError && "border-red-500 focus:border-red-500",
                          )}
                        />
                        {pinflError && (
                          <p className="mt-2 text-red-500 text-[10px] font-black uppercase tracking-widest">
                            {pinflError}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={handlePinflLogin}
                      className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 shrink-0"
                    >
                      Приступить к тесту
                    </button>
                  </div>
                </motion.div>
              )}

              {mode === "select_theme" && (
                <motion.div
                  key="select-theme"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
                  className="w-[576px] max-w-full"
                >
                  <div className="requested-surface bg-bento-card rounded-[32px] border border-bento-border p-6 md:p-8 w-full flex flex-col h-[576px] justify-between shadow-2xl relative overflow-hidden">
                    <div className="mb-6 text-center">
                      <h2 className="text-4xl font-black tracking-tight harmonious-text">
                        {t.chooseThemeHeading}
                      </h2>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="mb-6 space-y-4 flex-1 flex flex-col overflow-hidden">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-1 harmonious-text">
                          <BookOpen size={13} /> {t.selectTheme}
                        </label>
                        
                        <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
                          {/* Unified Dropdown Container as seen in photo */}
                          <div className={cn(
                            "flex-1 flex flex-col transition-all duration-300 overflow-hidden",
                            isThemeDropdownOpen
                              ? theme === 'dark'
                                ? "border border-bento-border rounded-[20px] bg-bento-bg/60 backdrop-blur-md shadow-2xl"
                                : "border border-bento-border/80 rounded-[20px] bg-white shadow-lg"
                              : theme === 'dark'
                                ? "border border-bento-border/50 rounded-xl bg-bento-bg/40 backdrop-blur-md shadow-none hover:border-indigo-500"
                                : "border border-bento-border/50 rounded-xl bg-bento-bg/30 shadow-none hover:border-indigo-500"
                          )}>
                            {/* Dropdown Header Row / Search Input */}
                            <div className={cn(
                              "relative px-4 py-3.5 flex items-center justify-between transition-all duration-300",
                              theme === 'dark' ? "bg-transparent" : "bg-zinc-50/50",
                              isThemeDropdownOpen 
                                ? theme === 'dark' 
                                  ? "border-b border-bento-border/50" 
                                  : "border-b border-bento-border/50" 
                                : "border-b-transparent"
                            )}>
                              <div className="relative flex-1">
                                <Search
                                  size={18}
                                  className={cn("absolute left-1 top-1/2 -translate-y-1/2", theme === 'dark' ? "text-zinc-400" : "text-zinc-500")}
                                />
                                <input
                                  type="text"
                                  placeholder="Поиск темы..."
                                  value={themeSearch}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsThemeDropdownOpen(true);
                                  }}
                                  onChange={(e) => {
                                    setThemeSearch(e.target.value);
                                    if (!isThemeDropdownOpen) {
                                      setIsThemeDropdownOpen(true);
                                    }
                                  }}
                                  className={cn(
                                    "requested-surface w-full pl-8 pr-10 bg-transparent border-none text-base font-black outline-none",
                                    theme === 'dark' ? "text-zinc-400 placeholder:text-zinc-400" : "text-zinc-950 placeholder:text-zinc-500"
                                  )}
                                />
                              </div>
                              <button
                                onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                                className="text-zinc-500 dark:text-zinc-400 p-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                <ChevronDown
                                  size={18}
                                  className={cn("transition-transform duration-300 stroke-[3]", isThemeDropdownOpen && "rotate-180")}
                                />
                              </button>
                            </div>

                            {/* Dropdown Items (Themes List) - Collapsible with animation */}
                            <AnimatePresence initial={false}>
                              {isThemeDropdownOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
                                  className="flex-1 flex flex-col overflow-hidden"
                                >
                                  <div className="flex-1 flex flex-col h-[240px] overflow-y-auto custom-scrollbar p-4 relative">
                                    {filteredThemes.map((themeItem, idx) => {
                                      const isSelected = selectedTheme === themeItem.name && language === themeItem.lang;
                                      
                                      // Dynamic path lighting calculations
                                      const selectedIndex = filteredThemes.findIndex(t => t.name === selectedTheme && t.lang === language);
                                      const isTrunkAboveActive = selectedIndex >= idx;
                                      const isTrunkBelowActive = selectedIndex > idx;

                                      return (
                                        <div key={`theme-${themeItem.name}-${themeItem.lang}-${idx}`} className="relative flex items-center pl-10 w-full py-1.5">
                                          {/* Tree Line Connector with customized highlight/default colors */}
                                          <div className="absolute left-0 top-0 bottom-0 w-10 pointer-events-none flex items-center">
                                            {/* Vertical line segment (above center) */}
                                            {idx > 0 && (
                                              <div className={cn(
                                                "absolute left-[14px] top-0 bottom-1/2 w-[2.5px] transition-colors duration-300",
                                                isTrunkAboveActive
                                                  ? "bg-indigo-600 dark:bg-indigo-400"
                                                  : "bg-black dark:bg-zinc-700"
                                              )} />
                                            )}
                                            {/* Vertical line segment (below center) */}
                                            {idx < filteredThemes.length - 1 && (
                                              <div className={cn(
                                                "absolute left-[14px] top-1/2 bottom-0 w-[2.5px] transition-colors duration-300",
                                                isTrunkBelowActive
                                                  ? "bg-indigo-600 dark:bg-indigo-400"
                                                  : "bg-black dark:bg-zinc-700"
                                              )} />
                                            )}
                                            {/* Horizontal branch line */}
                                            <div className={cn(
                                              "absolute left-[14px] right-2 top-1/2 -translate-y-1/2 h-[2.5px] transition-colors duration-300",
                                              isSelected
                                                ? "bg-indigo-600 dark:bg-indigo-400"
                                                : "bg-black dark:bg-zinc-700"
                                            )} />
                                            {/* Arrowhead pointing right */}
                                            <div className={cn(
                                              "absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-t-[2.5px] border-r-[2.5px] rotate-45 transition-colors duration-300",
                                              isSelected
                                                ? "border-indigo-600 dark:border-indigo-400"
                                                : "border-black dark:border-zinc-700"
                                            )} />

                                            {/* Gliding glowing junction dot */}
                                            {isSelected && (
                                              <motion.div
                                                layoutId="active-junction-dot"
                                                className="absolute left-[14px] top-1/2 -translate-y-1/2 -translate-x-[4.5px] w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.85)] z-10"
                                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                              />
                                            )}
                                          </div>

                                          <button
                                            onClick={() => {
                                              setSelectedTheme(themeItem.name);
                                              setLanguage(themeItem.lang);
                                            }}
                                            className={cn(
                                              "flex-1 px-3 py-2 rounded-2xl text-left border-2 transition-all duration-200 flex items-center justify-between group h-[48px]",
                                              isSelected
                                                ? theme === "dark"
                                                  ? "bg-indigo-500/10 border-indigo-500/50 text-white font-black"
                                                  : "bg-indigo-50/60 border-indigo-505/50 text-indigo-900 font-black shadow-sm"
                                                : theme === "dark"
                                                  ? "bg-transparent border-transparent text-zinc-100 hover:bg-white/5"
                                                  : "bg-transparent border-transparent text-zinc-900 hover:bg-zinc-100/40",
                                            )}
                                          >
                                            <div className="flex items-center gap-3">
                                              <div
                                                className={cn(
                                                  "w-7 h-5 flex items-center justify-center rounded text-[9px] font-black uppercase transition-colors",
                                                  isSelected
                                                    ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                                                    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
                                                )}
                                              >
                                                {themeItem.lang}
                                              </div>
                                              <span
                                                className={cn(
                                                  "text-xs font-black leading-tight",
                                                  isSelected
                                                    ? theme === "dark"
                                                      ? "text-white"
                                                      : "text-indigo-950"
                                                    : theme === "dark"
                                                      ? "text-white/85"
                                                      : "text-zinc-900",
                                                )}
                                              >
                                                {themeItem.name}
                                              </span>
                                            </div>
                                            <div
                                              className={cn(
                                                "w-4 h-4 rounded-full border flex-shrink-0 ml-4 flex items-center justify-center transition-all",
                                                isSelected
                                                  ? "border-indigo-500 dark:border-indigo-400"
                                                  : "border-zinc-300 dark:border-zinc-650",
                                              )}
                                            >
                                              {isSelected && (
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                                              )}
                                            </div>
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {filteredThemes.length === 0 && (
                                      <div className="p-8 text-center bg-bento-bg/50 rounded-2xl border border-dashed border-bento-border">
                                        <p className="text-xs text-zinc-400 font-bold italic">
                                          Темы не найдены
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        disabled={!selectedTheme}
                        onClick={() => setMode("select_group")}
                        className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black text-sm disabled:opacity-30 transition-all active:scale-[0.98] uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        {t.next} <ArrowRight size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {mode === "select_group" && (
                <motion.div
                  key="select-group"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
                  className="w-[576px] max-w-full"
                >
                  <div className="requested-surface bg-bento-card rounded-[32px] border border-bento-border p-6 md:p-8 w-full flex flex-col h-[576px] justify-between shadow-2xl relative overflow-hidden">
                    <div className="mb-6 text-center">
                      <h2 className="text-4xl font-black tracking-tight harmonious-text">
                        {t.groupInfo}
                      </h2>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="mb-6 space-y-4 flex-1 flex flex-col overflow-hidden">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-1 harmonious-text">
                          <Globe size={13} /> {t.selectGroup}
                        </label>

                        <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
                          {/* Unified Dropdown Container as seen in photo */}
                          <div className={cn(
                            "flex-1 flex flex-col transition-all duration-300 overflow-hidden",
                            isGroupDropdownOpen
                              ? theme === 'dark'
                                ? "border border-bento-border rounded-[20px] bg-bento-bg/60 backdrop-blur-md shadow-2xl"
                                : "border border-bento-border/80 rounded-[20px] bg-white shadow-lg"
                              : theme === 'dark'
                                ? "border border-bento-border/50 rounded-xl bg-bento-bg/40 backdrop-blur-md shadow-none hover:border-indigo-500"
                                : "border border-bento-border/50 rounded-xl bg-bento-bg/30 shadow-none hover:border-indigo-500"
                          )}>
                            {/* Dropdown Header Row / Search Input */}
                            <div className={cn(
                              "relative px-4 py-3.5 flex items-center justify-between transition-all duration-300",
                              theme === 'dark' ? "bg-transparent" : "bg-zinc-50/50",
                              isGroupDropdownOpen 
                                ? theme === 'dark' 
                                  ? "border-b border-bento-border/50" 
                                  : "border-b border-bento-border/50" 
                                : "border-b-transparent"
                            )}>
                              <div className="relative flex-1">
                                <Search
                                  size={18}
                                  className={cn("absolute left-1 top-1/2 -translate-y-1/2", theme === 'dark' ? "text-zinc-400" : "text-zinc-500")}
                                />
                                <input
                                  type="text"
                                  placeholder="Поиск группы..."
                                  value={groupSearch}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsGroupDropdownOpen(true);
                                  }}
                                  onChange={(e) => {
                                    setGroupSearch(e.target.value);
                                    if (!isGroupDropdownOpen) {
                                      setIsGroupDropdownOpen(true);
                                    }
                                  }}
                                  className={cn(
                                    "requested-surface w-full pl-8 pr-10 bg-transparent border-none text-base font-black outline-none",
                                    theme === 'dark' ? "text-zinc-400 placeholder:text-zinc-400" : "text-zinc-950 placeholder:text-zinc-500"
                                  )}
                                />
                              </div>
                              <button
                                onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
                                className="text-zinc-500 dark:text-zinc-400 p-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                <ChevronDown
                                  size={18}
                                  className={cn("transition-transform duration-300 stroke-[3]", isGroupDropdownOpen && "rotate-180")}
                                />
                              </button>
                            </div>

                            {/* Dropdown Items (Groups List) - Collapsible with animation */}
                            <AnimatePresence initial={false}>
                              {isGroupDropdownOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
                                  className="flex-1 flex flex-col overflow-hidden"
                                >
                                  <div className="flex-1 flex flex-col h-[240px] overflow-y-auto custom-scrollbar p-4 relative">
                                    {(() => {
                                      const filteredGroups = groups.filter((g) =>
                                        g.name.toLowerCase().includes(groupSearch.toLowerCase())
                                      );
                                      return (
                                        <>
                                          {filteredGroups.map((g, idx) => {
                                            const isSelected = selectedGroup === g.id;
                                            const selectedIndex = filteredGroups.findIndex(item => item.id === selectedGroup);
                                            const isTrunkAboveActive = selectedIndex >= idx;
                                            const isTrunkBelowActive = selectedIndex > idx;

                                            return (
                                              <div key={`group-${g.id}-${idx}`} className="relative flex items-center pl-10 w-full py-1.5">
                                                {/* Tree Line Connector with customized highlight/default colors */}
                                                <div className="absolute left-0 top-0 bottom-0 w-10 pointer-events-none flex items-center">
                                                  {/* Vertical line segment (above center) */}
                                                  {idx > 0 && (
                                                    <div className={cn(
                                                      "absolute left-[14px] top-0 bottom-1/2 w-[2.5px] transition-colors duration-300 overflow-hidden",
                                                      isTrunkAboveActive
                                                        ? "bg-indigo-600 dark:bg-indigo-400"
                                                        : "bg-black dark:bg-zinc-700"
                                                    )}>
                                                      {isTrunkAboveActive && (
                                                        <motion.div
                                                          className="absolute left-0 right-0 top-0 h-12 bg-gradient-to-b from-transparent via-white/85 to-transparent shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                                          animate={{
                                                            y: ["-100%", "300%"]
                                                          }}
                                                          transition={{
                                                            repeat: Infinity,
                                                            duration: 1.5,
                                                            ease: "linear"
                                                          }}
                                                        />
                                                      )}
                                                    </div>
                                                  )}
                                                  {/* Vertical line segment (below center) */}
                                                  {idx < filteredGroups.length - 1 && (
                                                    <div className={cn(
                                                      "absolute left-[14px] top-1/2 bottom-0 w-[2.5px] transition-colors duration-300 overflow-hidden",
                                                      isTrunkBelowActive
                                                        ? "bg-indigo-600 dark:bg-indigo-400"
                                                        : "bg-black dark:bg-zinc-700"
                                                    )}>
                                                      {isTrunkBelowActive && (
                                                        <motion.div
                                                          className="absolute left-0 right-0 top-0 h-12 bg-gradient-to-b from-transparent via-white/85 to-transparent shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                                          animate={{
                                                            y: ["-100%", "300%"]
                                                          }}
                                                          transition={{
                                                            repeat: Infinity,
                                                            duration: 1.5,
                                                            ease: "linear"
                                                          }}
                                                        />
                                                      )}
                                                    </div>
                                                  )}
                                                  {/* Horizontal branch line */}
                                                  <div className={cn(
                                                    "absolute left-[14px] right-2 top-1/2 -translate-y-1/2 h-[2.5px] transition-colors duration-300",
                                                    isSelected
                                                      ? "bg-indigo-600 dark:bg-indigo-400"
                                                      : "bg-black dark:bg-zinc-700"
                                                  )} />
                                                  {/* Arrowhead pointing right */}
                                                  <div className={cn(
                                                    "absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-t-[2.5px] border-r-[2.5px] rotate-45 transition-colors duration-300",
                                                    isSelected
                                                      ? "border-indigo-600 dark:border-indigo-400"
                                                      : "border-black dark:border-zinc-700"
                                                  )} />

                                                  {/* Gliding glowing junction dot */}
                                                  {isSelected && (
                                                    <motion.div
                                                      layoutId="active-group-junction-dot"
                                                       className="absolute left-[14px] top-1/2 -translate-y-1/2 -translate-x-[4.5px] w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.85)] z-10"
                                                       transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                                     />
                                                   )}
                                                 </div>

                                                 <button
                                                  onClick={() => {
                                                    setSelectedGroup(g.id);
                                                    setSelectedStudent(null);
                                                  }}
                                                  className={cn(
                                                    "flex-1 px-3 py-2 rounded-2xl text-left border-2 transition-all duration-200 flex items-center justify-between group min-h-[48px] h-auto relative overflow-hidden",
                                                    isSelected
                                                      ? theme === "dark"
                                                        ? "bg-indigo-500/10 border-indigo-500/50 text-white font-black"
                                                        : "bg-indigo-50/60 border-indigo-500/50 text-indigo-700 font-black shadow-sm"
                                                      : theme === "dark"
                                                        ? "bg-transparent border-transparent text-zinc-100 hover:bg-white/5"
                                                        : "bg-transparent border-transparent text-zinc-900 hover:bg-zinc-100/40",
                                                  )}
                                                >
                                                  <div className="flex items-center gap-3 relative z-10">
                                                    <div
                                                      className={cn(
                                                        "w-8 h-5 flex items-center justify-center rounded text-[9px] font-black uppercase transition-colors shrink-0",
                                                        isSelected
                                                          ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                                                          : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
                                                      )}
                                                    >
                                                      {g.language?.toUpperCase() || "RU"}
                                                    </div>
                                                    <div className="flex flex-col">
                                                      {false && (
                                                        <span className="text-[8.5px] font-black text-indigo-600 dark:text-indigo-450 uppercase tracking-widest leading-none mb-0.5 animate-pulse">
                                                          ⚡ {language === 'uz' ? 'Yo‘naltirilgan Tok Impulsi' : 'Импульс Направленного Тока'}
                                                        </span>
                                                      )}
                                                      <span
                                                        className={cn(
                                                          "text-xs font-black leading-tight",
                                                          isSelected
                                                            ? theme === "dark"
                                                              ? "text-white"
                                                              : "text-indigo-900"
                                                            : theme === "dark"
                                                              ? "text-white/85"
                                                              : "text-zinc-900",
                                                        )}
                                                      >
                                                        {g.name}
                                                      </span>
                                                    </div>
                                                  </div>
                                                  <div
                                                    className={cn(
                                                      "w-4 h-4 rounded-full border flex-shrink-0 ml-4 flex items-center justify-center transition-all",
                                                      isSelected
                                                        ? "border-indigo-500 dark:border-indigo-400"
                                                        : "border-zinc-300 dark:border-zinc-650",
                                                    )}
                                                  >
                                                    {isSelected && (
                                                      <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                                                    )}
                                                  </div>
                                                </button>
                                              </div>
                                            );
                                          })}
                                          {filteredGroups.length === 0 && (
                                            <div className="p-8 text-center bg-bento-bg/50 rounded-2xl border border-dashed border-bento-border">
                                              <p className="text-xs text-zinc-400 font-bold italic">
                                                Группы не найдены
                                              </p>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => setMode("select_theme")}
                        className="flex-1 px-8 py-4 rounded-xl font-black text-xs text-zinc-400 hover:bg-indigo-600/10 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400 transition-all uppercase tracking-widest border border-transparent hover:border-bento-border"
                      >
                        {t.previous}
                      </button>
                      <button
                        disabled={!selectedGroup}
                        onClick={() => setMode("select_student")}
                        className="flex-[2] bg-indigo-600 text-white py-4 rounded-xl font-black text-sm disabled:opacity-30 transition-all active:scale-[0.98] uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        {t.next} <ArrowRight size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {mode === "select_student" && (
                <motion.div
                  key="select-student"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
                  className="w-[576px] max-w-full"
                >
                  <div className="bg-bento-card rounded-[32px] border border-bento-border p-6 md:p-8 w-full flex flex-col h-[576px] justify-between shadow-2xl relative overflow-hidden">
                    <div className="mb-6 text-center">
                      <h2 className="text-4xl font-black tracking-tight harmonious-text">
                        {t.chooseYourself}
                      </h2>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="mb-6 space-y-4 flex-1 flex flex-col overflow-hidden">
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-1 harmonious-text">
                          <GraduationCap size={13} /> {t.selectStudent}
                        </label>

                        <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
                          {/* Unified Dropdown Container */}
                          <div className={cn(
                            "flex-1 flex flex-col transition-all duration-300 overflow-hidden",
                            isStudentDropdownOpen
                              ? theme === 'dark'
                                ? "border border-bento-border rounded-[20px] bg-bento-bg/60 backdrop-blur-md shadow-2xl"
                                : "border border-bento-border/80 rounded-[20px] bg-white shadow-lg"
                              : theme === 'dark'
                                ? "border border-bento-border/50 rounded-xl bg-bento-bg/40 backdrop-blur-md shadow-none hover:border-indigo-500"
                                : "border border-bento-border/50 rounded-xl bg-bento-bg/30 shadow-none hover:border-indigo-500"
                          )}>
                            {/* Dropdown Header Row / Search Input */}
                            <div className={cn(
                              "relative px-4 py-3.5 flex items-center justify-between transition-all duration-300",
                              theme === 'dark' ? "bg-transparent" : "bg-zinc-50/50",
                              isStudentDropdownOpen 
                                ? theme === 'dark' 
                                  ? "border-b border-bento-border/50" 
                                  : "border-b border-bento-border/50" 
                                : "border-b-transparent"
                            )}>
                              <div className="relative flex-1">
                                <Search
                                  size={18}
                                  className={cn("absolute left-1 top-1/2 -translate-y-1/2", theme === 'dark' ? "text-zinc-400" : "text-zinc-500")}
                                />
                                <input
                                  type="text"
                                  placeholder="Поиск себя..."
                                  value={studentSearch}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsStudentDropdownOpen(true);
                                  }}
                                  onChange={(e) => {
                                    setStudentSearch(e.target.value);
                                    if (!isStudentDropdownOpen) {
                                      setIsStudentDropdownOpen(true);
                                    }
                                  }}
                                  className={cn(
                                    "w-full pl-8 pr-10 bg-transparent border-none text-base font-black outline-none",
                                    theme === 'dark' ? "text-zinc-400 placeholder:text-zinc-400" : "text-zinc-950 placeholder:text-zinc-500"
                                  )}
                                />
                              </div>
                              <button
                                onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
                                className="text-zinc-500 dark:text-zinc-400 p-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                <ChevronDown
                                  size={18}
                                  className={cn("transition-transform duration-300 stroke-[3]", isStudentDropdownOpen && "rotate-180")}
                                />
                              </button>
                            </div>

                            {/* Dropdown Items (Students List) - Collapsible with animation */}
                            <AnimatePresence initial={false}>
                              {isStudentDropdownOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
                                  className="flex-1 flex flex-col overflow-hidden"
                                >
                                  <div className="flex-1 flex flex-col h-[240px] overflow-y-auto custom-scrollbar p-4 relative">
                                    {(() => {
                                      const filteredAndSearchedStudents = filteredStudents.filter((s) =>
                                        `${s.lastName} ${s.firstName}`.toLowerCase().includes(studentSearch.toLowerCase())
                                      );
                                      return (
                                        <>
                                          {filteredAndSearchedStudents.map((s, idx) => {
                                            const isSelected = selectedStudent?.id === s.id;
                                            const selectedIndex = filteredAndSearchedStudents.findIndex(item => item.id === selectedStudent?.id);
                                            const isTrunkAboveActive = selectedIndex >= idx;
                                            const isTrunkBelowActive = selectedIndex > idx;

                                            return (
                                              <div key={`student-${s.id}-${idx}`} className="relative flex items-center pl-10 w-full py-1.5">
                                                {/* Tree Line Connector with customized highlight/default colors */}
                                                <div className="absolute left-0 top-0 bottom-0 w-10 pointer-events-none flex items-center">
                                                  {/* Vertical line segment (above center) */}
                                                  {idx > 0 && (
                                                    <div className={cn(
                                                      "absolute left-[14px] top-0 bottom-1/2 w-[2.5px] transition-colors duration-300",
                                                      isTrunkAboveActive
                                                        ? "bg-indigo-600 dark:bg-indigo-400"
                                                        : "bg-black dark:bg-zinc-700"
                                                    )} />
                                                  )}
                                                  {/* Vertical line segment (below center) */}
                                                  {idx < filteredAndSearchedStudents.length - 1 && (
                                                    <div className={cn(
                                                      "absolute left-[14px] top-1/2 bottom-0 w-[2.5px] transition-colors duration-300",
                                                      isTrunkBelowActive
                                                        ? "bg-indigo-600 dark:bg-indigo-400"
                                                        : "bg-black dark:bg-zinc-700"
                                                    )} />
                                                  )}
                                                  {/* Horizontal branch line */}
                                                  <div className={cn(
                                                    "absolute left-[14px] right-2 top-1/2 -translate-y-1/2 h-[2.5px] transition-colors duration-300",
                                                    isSelected
                                                      ? "bg-indigo-600 dark:bg-indigo-400"
                                                      : "bg-black dark:bg-zinc-700"
                                                  )} />
                                                  {/* Arrowhead pointing right */}
                                                  <div className={cn(
                                                    "absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 border-t-[2.5px] border-r-[2.5px] rotate-45 transition-colors duration-300",
                                                    isSelected
                                                      ? "border-indigo-600 dark:border-indigo-400"
                                                      : "border-black dark:border-zinc-700"
                                                  )} />

                                                  {/* Gliding glowing junction dot with Energy Burst effect */}
                                                  {isSelected && (
                                                    <motion.div
                                                      layoutId="active-student-junction-dot"
                                                      className="absolute left-[14px] top-1/2 -translate-y-1/2 -translate-x-[4.5px] w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.85)] z-10"
                                                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                                    />
                                                  )}
                                                </div>

                                                <button
                                                  onClick={() => {
                                                    setSelectedStudent(s);
                                                  }}
                                                  className={cn(
                                                    "flex-1 px-3 py-2 rounded-2xl text-left border-2 transition-all duration-200 flex items-center justify-between group h-[48px] relative overflow-hidden",
                                                    isSelected
                                                      ? theme === "dark"
                                                        ? "bg-indigo-500/10 border-indigo-500/50 text-white font-black"
                                                        : "bg-indigo-50/60 border-indigo-500/50 text-indigo-700 font-black shadow-sm"
                                                      : theme === "dark"
                                                        ? "bg-transparent border-transparent text-zinc-100 hover:bg-white/5"
                                                        : "bg-transparent border-transparent text-zinc-900 hover:bg-zinc-100/40",
                                                  )}
                                                >
                                                  {/* Energy Burst Particle Eruption Effect on Selection */}
                                                  {false && (
                                                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                                                      {/* Expanding ambient glow ring */}
                                                      <motion.div
                                                        initial={{ scale: 0.5, opacity: 1 }}
                                                        animate={{ scale: 2.5, opacity: 0 }}
                                                        transition={{ duration: 0.6, ease: "easeOut" }}
                                                        className="absolute inset-0 border-2 border-rose-500 rounded-2xl shadow-[0_0_10px_rgba(244,63,94,0.4)]"
                                                      />
                                                      {/* Double high-energy shockwave ring */}
                                                      <motion.div
                                                        initial={{ scale: 0.3, opacity: 0.8 }}
                                                        animate={{ scale: 3.5, opacity: 0 }}
                                                        transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
                                                        className="absolute inset-0 border border-orange-400 bg-rose-500/5 rounded-2xl shadow-[0_0_15px_rgba(244,63,94,0.6)]"
                                                      />
                                                      {/* Directional burst spark particles */}
                                                      {[...Array(6)].map((_, sparkIndex) => {
                                                        const angle = (sparkIndex * 360) / 6;
                                                        const distance = 90;
                                                        const destX = Math.cos((angle * Math.PI) / 180) * distance;
                                                        const destY = Math.sin((angle * Math.PI) / 180) * distance;
                                                        return (
                                                          <motion.div
                                                            key={`spark-${sparkIndex}`}
                                                            initial={{ x: 0, y: 0, scale: 1.5, opacity: 1 }}
                                                            animate={{ x: destX, y: destY, scale: 0, opacity: 0 }}
                                                            transition={{ duration: 0.7, ease: [0.1, 0.8, 0.2, 1] }}
                                                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-orange-400 via-rose-500 to-amber-400 shadow-[0_0_10px_rgba(244,63,94,0.95)]"
                                                          />
                                                        );
                                                      })}
                                                    </div>
                                                  )}

                                                  <div className="flex flex-col relative z-10">
                                                    {s.id &&
                                                      selectedTheme &&
                                                      selectedGroup &&
                                                      storage.getResults().some((r) => {
                                                        const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;
                                                        const isRecent = Date.now() - new Date(r.timestamp).getTime() < ONE_MONTH;
                                                        return (
                                                          r.studentId === s.id &&
                                                          r.groupId === s.groupId &&
                                                          r.percentage === 100 &&
                                                          r.theme === selectedTheme &&
                                                          isRecent
                                                        );
                                                      }) && (
                                                        <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest leading-none mb-0.5 animate-pulse">
                                                          {t.legend}
                                                        </span>
                                                      )}

                                                    <span
                                                      className={cn(
                                                        "text-xs font-black transition-colors leading-tight",
                                                        isSelected
                                                          ? theme === "dark"
                                                            ? "text-white"
                                                            : "text-indigo-900"
                                                          : theme === "dark"
                                                            ? "text-white/85"
                                                            : "text-zinc-900",
                                                      )}
                                                    >
                                                      {s.lastName} {s.firstName}
                                                    </span>
                                                  </div>
                                                  <div
                                                    className={cn(
                                                      "w-4 h-4 rounded-full border flex-shrink-0 ml-4 flex items-center justify-center transition-all relative z-10",
                                                      isSelected
                                                        ? "border-indigo-500 dark:border-indigo-400"
                                                        : "border-zinc-300 dark:border-zinc-650",
                                                    )}
                                                  >
                                                    {isSelected && (
                                                      <div className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                                                    )}
                                                  </div>
                                                </button>
                                              </div>
                                            );
                                          })}
                                          {filteredAndSearchedStudents.length === 0 && (
                                            <div className="p-8 text-center bg-bento-bg/50 rounded-2xl border border-dashed border-bento-border">
                                              <p className="text-xs text-zinc-400 font-bold italic">
                                                Студенты не найдены
                                              </p>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => setMode("select_group")}
                        className="flex-1 px-8 py-4 rounded-xl font-black text-xs text-zinc-400 hover:bg-indigo-600/10 hover:text-indigo-600 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-400 transition-all uppercase tracking-widest border border-transparent hover:border-bento-border"
                      >
                        Назад
                      </button>
                      <button
                        disabled={!selectedStudent}
                        onClick={handleStartExam}
                        className="flex-[2] bg-indigo-600 text-white py-4 rounded-xl font-black text-sm disabled:opacity-30 transition-all active:scale-[0.98] uppercase tracking-widest"
                      >
                        {t.startExam}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {mode === "result" && lastResult && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
                  className="w-[576px] max-w-full px-4 text-center mx-auto"
                >
                  <div className="bg-bento-card rounded-[40px] p-6 md:p-8 text-center border border-bento-border relative overflow-hidden h-[576px] flex flex-col justify-between shadow-2xl">
                    {/* Atmospheric background elements */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

                    {lastResult.percentage === 100 && (
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                        <motion.div
                          initial={{ scale: 0, rotate: -20 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{
                            type: "spring",
                            bounce: 0.5,
                            delay: 0.5,
                          }}
                          className="bg-gradient-to-br from-yellow-300 via-yellow-500 to-amber-600 p-0.5 rounded-xl shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                        >
                          <div className="bg-black/20 px-4 py-1 rounded-lg backdrop-blur-sm border border-white/20">
                            <span className="text-xs font-black text-white italic tracking-tighter drop-shadow-md">
                              {t.legend}
                            </span>
                          </div>
                        </motion.div>
                      </div>
                    )}

                    <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl" />
                    <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl" />

                    <div className="flex-1 flex flex-col justify-center overflow-hidden py-1">
                      <motion.div
                        initial={{ y: 15, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.05 }}
                        className="w-14 h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2.5 text-yellow-500 border border-yellow-500/20 flex-shrink-0"
                      >
                        <Trophy size={28} />
                      </motion.div>

                      <motion.h2
                        initial={{ y: 15, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-2xl font-black text-bento-text-main dark:text-white mb-1 italic tracking-tight flex-shrink-0"
                      >
                        {t.testResults}
                      </motion.h2>

                      <motion.div
                        initial={{ y: 15, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.15 }}
                        className="flex flex-col gap-2 mb-3.5 flex-shrink-0"
                      >
                        <p className="text-zinc-500 dark:text-zinc-300 font-black uppercase tracking-[0.2em] text-[9px]">
                          {t.resultSaved}
                        </p>
                        <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-indigo-600 dark:bg-indigo-500/20 text-white dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest mx-auto">
                          <Timer size={11} className="animate-pulse" />
                          {t.autoExit} {resultsTimer} {t.seconds}
                        </div>
                      </motion.div>

                      <div className="space-y-1 mb-3.5 flex-shrink-0">
                        <motion.h3
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.2 }}
                          className="text-lg font-black text-bento-text-main dark:text-white leading-tight"
                        >
                          {selectedStudent?.lastName} {selectedStudent?.firstName}
                        </motion.h3>
                        <motion.p
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.25 }}
                          className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest"
                        >
                          {lastResult.groupName} / {selectedStudent?.subgroup || "A"} / {lastResult.language?.toUpperCase()}
                        </motion.p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3.5 flex-shrink-0">
                        <motion.div
                          initial={{ x: -15, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="bg-indigo-600/5 dark:bg-indigo-500/10 p-4 rounded-2xl border border-bento-border text-center"
                        >
                          <p className="text-2xl font-black text-indigo-600 dark:text-white tracking-tighter leading-none">
                            {lastResult.score}
                          </p>
                          <p className="text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-400 mt-1.5 tracking-widest leading-none">
                            {t.correct}
                          </p>
                        </motion.div>
                        <motion.div
                          initial={{ x: 15, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="bg-indigo-600/5 dark:bg-indigo-500/10 p-4 rounded-2xl border border-bento-border text-center"
                        >
                          <p className="text-2xl font-black text-indigo-600 dark:text-white tracking-tighter leading-none">
                            {lastResult.percentage}%
                          </p>
                          <p className="text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-400 mt-1.5 tracking-widest leading-none">
                            {t.percentage}
                          </p>
                        </motion.div>
                      </div>

                      <div className="space-y-4 mb-4 flex-shrink-0">
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${lastResult.percentage}%` }}
                            transition={{
                              duration: 1,
                              ease: "circOut",
                              delay: 0.4,
                            }}
                            className="h-full bg-indigo-600"
                          />
                        </div>
                      </div>
                    </div>

                    <motion.button
                      initial={{ y: 15, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      onClick={handleReset}
                      className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-black text-xs hover:bg-indigo-700 active:scale-[0.98] transition-all uppercase tracking-widest flex-shrink-0"
                    >
                      {t.logout}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </>
      )}
    </div>
  );
};
