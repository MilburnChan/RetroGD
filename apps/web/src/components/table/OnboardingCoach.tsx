interface CoachStep {
  id: string;
  title: string;
  text: string;
}

const steps: CoachStep[] = [
  {
    id: "select",
    title: "步骤 1 · 选牌",
    text: "点击手牌完成选择；移动端长按 220ms 可预览牌面。"
  },
  {
    id: "play",
    title: "步骤 2 · 确认出牌",
    text: "底部点击“确认出牌”后会进入 1.2 秒缓冲窗口，可撤销。"
  },
  {
    id: "read",
    title: "步骤 3 · 看上手",
    text: "中央回合罗盘会提示上手牌型，帮助你快速判断是否可压。"
  }
];

interface OnboardingCoachProps {
  open: boolean;
  stepIndex: number;
  onNext: () => void;
  onClose: () => void;
  onDisablePermanently: () => void;
}

export function OnboardingCoach({ open, stepIndex, onNext, onClose, onDisablePermanently }: OnboardingCoachProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const step = steps[Math.min(stepIndex, steps.length - 1)] as CoachStep;
  const isLast = stepIndex >= steps.length - 1;

  return (
    <div className="coach-overlay" role="dialog" aria-modal="true">
      <div className="coach-card pixel-panel">
        <p className="coach-title">{step.title}</p>
        <p className="coach-text">{step.text}</p>

        <div className="coach-actions">
          <button type="button" className="pixel-btn secondary" onClick={onDisablePermanently}>
            永久关闭
          </button>
          <button type="button" className="pixel-btn secondary" onClick={onClose}>
            稍后再看
          </button>
          <button type="button" className="pixel-btn" onClick={isLast ? onClose : onNext}>
            {isLast ? "完成引导" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}
import { useEffect } from "react";
