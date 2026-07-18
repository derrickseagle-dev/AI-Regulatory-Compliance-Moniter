import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { RULE_TEMPLATES } from "~/lib/rules/templates";

export const Route = createFileRoute("/app/onboarding")({
  component: OnboardingWizard,
});

type Step = 1 | 2 | 3;

function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Step 1 state
  const [uploadedFile, setUploadedFile] = useState<{ name: string; id: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Step 2 state
  const [activeRules, setActiveRules] = useState<Set<string>>(new Set());
  const [rulesActivated, setRulesActivated] = useState(false);

  useEffect(() => {
    // Fetch current onboarding step from server
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        if (data.user?.onboardingStep && data.user.onboardingStep > 0) {
          setStep(Math.min(data.user.onboardingStep, 3) as Step);
        }
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, []);

  const saveProgress = useCallback(async (newStep: number, completed = false) => {
    setSaving(true);
    try {
      await fetch("/api/v1/me/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingStep: newStep, onboardingCompleted: completed }),
      });
    } catch {}
    setSaving(false);
  }, []);

  const goToStep = (nextStep: Step) => {
    setStep(nextStep);
    saveProgress(nextStep);
  };

  const handleSkip = () => {
    saveProgress(3, true);
    window.location.href = "/app";
  };

  const handleFileUpload = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/v1/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.documents || data.documents.length === 0) {
        setUploadError(data.error?.message || "Upload failed");
        return;
      }
      const doc = data.documents[0];
      if (doc.status === "failed") {
        setUploadError(doc.error || "Upload failed");
        return;
      }
      setUploadedFile({ name: doc.filename || file.name, id: doc.id });
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const toggleRule = (name: string) => {
    setActiveRules(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleActivateRules = async () => {
    setSaving(true);
    try {
      await fetch("/api/v1/rules/templates", { method: "POST" });
      setRulesActivated(true);
    } catch {}
    setSaving(false);
  };

  const handleFinish = () => {
    saveProgress(3, true);
    window.location.href = "/app";
  };

  if (!initialized) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400">Loading…</p>
      </div>
    );
  }

  const steps: { num: Step; label: string }[] = [
    { num: 1, label: "Upload Document" },
    { num: 2, label: "Activate Rules" },
    { num: 3, label: "All Set" },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">Welcome to Regula AI</h1>
        <p className="mt-2 text-gray-400">Let&apos;s get you set up in just a few steps.</p>
      </div>

      {/* Progress Bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition ${
                    step > s.num
                      ? "bg-indigo-600 text-white"
                      : step === s.num
                        ? "bg-indigo-600/30 border-2 border-indigo-500 text-indigo-400"
                        : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {step > s.num ? "✓" : s.num}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    step >= s.num ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`mx-2 h-0.5 w-16 sm:w-24 transition ${
                    step > s.num ? "bg-indigo-600" : "bg-gray-800"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8">
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Upload your first document</h2>
            <p className="text-sm text-gray-400 mb-6">
              Drag and drop a PDF, DOCX, or TXT file to start monitoring for compliance issues.
            </p>

            {uploadedFile ? (
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-6 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
                  <CheckIcon />
                </div>
                <p className="text-green-400 font-medium">Document uploaded successfully!</p>
                <p className="mt-1 text-sm text-gray-400">{uploadedFile.name}</p>
                <button
                  onClick={() => goToStep(2)}
                  className="mt-4 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition"
                >
                  Continue to Rules
                </button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
                  uploadError
                    ? "border-red-500/40 bg-red-500/5"
                    : "border-gray-700 bg-gray-800/30 hover:border-indigo-500/50 hover:bg-gray-800/60"
                }`}
              >
                {uploading ? (
                  <div>
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                    <p className="mt-3 text-sm text-gray-400">Uploading…</p>
                  </div>
                ) : (
                  <>
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
                      <UploadIcon />
                    </div>
                    <p className="text-sm text-gray-300">
                      <label className="cursor-pointer text-indigo-400 hover:text-indigo-300 font-medium">
                        Browse files
                        <input type="file" accept=".pdf,.docx,.txt" onChange={handleFilePick} className="hidden" />
                      </label>
                      {" "}or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-gray-500">PDF, DOCX, TXT up to 10MB</p>
                  </>
                )}
                {uploadError && (
                  <p className="mt-3 text-sm text-red-400">{uploadError}</p>
                )}
              </div>
            )}

            <div className="mt-6 text-center">
              <button onClick={handleSkip} className="text-sm text-gray-500 hover:text-gray-400 transition">
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Activate your first rules</h2>
            <p className="text-sm text-gray-400 mb-6">
              Select the compliance frameworks that apply to your organization. Rules can be customized later.
            </p>

            {rulesActivated ? (
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-6 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
                  <CheckIcon />
                </div>
                <p className="text-green-400 font-medium">Rules activated!</p>
                <p className="mt-1 text-sm text-gray-400">
                  {RULE_TEMPLATES.length} compliance templates available for your account.
                </p>
                <button
                  onClick={() => goToStep(3)}
                  className="mt-4 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition"
                >
                  Continue
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm text-gray-400">
                    {activeRules.size} of {RULE_TEMPLATES.length} selected
                  </span>
                  <button
                    onClick={() =>
                      setActiveRules(new Set(RULE_TEMPLATES.map(t => t.name)))
                    }
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Select all
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {RULE_TEMPLATES.map(tmpl => {
                    const isActive = activeRules.has(tmpl.name);
                    return (
                      <button
                        key={tmpl.name}
                        onClick={() => toggleRule(tmpl.name)}
                        className={`rounded-xl border p-4 text-left transition ${
                          isActive
                            ? "border-indigo-500/40 bg-indigo-600/10"
                            : "border-gray-800 bg-gray-800/30 hover:border-gray-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {tmpl.name}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">
                              {tmpl.description}
                            </p>
                          </div>
                          <div
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                              isActive
                                ? "border-indigo-500 bg-indigo-600"
                                : "border-gray-600"
                            }`}
                          >
                            {isActive && (
                              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${frameworkBadge(tmpl.framework)}`}>
                            {tmpl.framework}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge(tmpl.severity)}`}>
                            {tmpl.severity}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button onClick={() => goToStep(1)} className="text-sm text-gray-500 hover:text-gray-400 transition">
                    ← Back
                  </button>
                  <div className="flex items-center gap-3">
                    <button onClick={handleSkip} className="text-sm text-gray-500 hover:text-gray-400 transition">
                      Skip for now
                    </button>
                    <button
                      onClick={handleActivateRules}
                      disabled={saving || activeRules.size === 0}
                      className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
                    >
                      {saving ? "Activating…" : "Activate Rules"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/20">
              <svg className="h-8 w-8 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">You&apos;re all set!</h2>
            <p className="mt-2 text-sm text-gray-400">
              Here&apos;s a summary of what you&apos;ve configured:
            </p>

            <div className="mt-6 space-y-3 text-left">
              <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/30 px-4 py-3">
                <span className="text-lg">📄</span>
                <div>
                  <p className="text-sm font-medium text-white">Document Upload</p>
                  <p className="text-xs text-gray-400">
                    {uploadedFile ? `Uploaded: ${uploadedFile.name}` : "Skipped — you can upload documents anytime from the dashboard"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/30 px-4 py-3">
                <span className="text-lg">⚙️</span>
                <div>
                  <p className="text-sm font-medium text-white">Rules Configured</p>
                  <p className="text-xs text-gray-400">
                    {rulesActivated
                      ? `${RULE_TEMPLATES.length} compliance templates activated`
                      : `${activeRules.size} template${activeRules.size !== 1 ? "s" : ""} selected for activation`}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleFinish}
              disabled={saving}
              className="mt-8 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
            >
              {saving ? "Finishing…" : "Go to Dashboard"}
            </button>
            <button
              onClick={handleSkip}
              className="mt-3 text-sm text-gray-500 hover:text-gray-400 transition"
            >
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-7 w-7 text-green-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function frameworkBadge(fw: string) {
  const map: Record<string, string> = {
    GDPR: "bg-blue-500/10 text-blue-400",
    SEC: "bg-purple-500/10 text-purple-400",
    HIPAA: "bg-red-500/10 text-red-400",
    FINRA: "bg-amber-500/10 text-amber-400",
    FDA: "bg-green-500/10 text-green-400",
  };
  return map[fw] || "bg-gray-500/10 text-gray-400";
}

function severityBadge(s: string) {
  const map: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400",
    high: "bg-orange-500/10 text-orange-400",
    medium: "bg-yellow-500/10 text-yellow-400",
    low: "bg-blue-500/10 text-blue-400",
  };
  return map[s] || "bg-gray-500/10 text-gray-400";
}
