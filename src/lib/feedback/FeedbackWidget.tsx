import { useState, useEffect } from "react";

const EMOJIS = ["😡", "😟", "😐", "😊", "😍"];
const LABELS = ["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(null);
      setMessage("");
      setSubmitted(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleSubmit = async () => {
    if (rating === null) return;
    setSubmitting(true);
    try {
      await fetch("/api/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: rating + 1, // 1-5
          message: message.trim() || undefined,
          pageUrl: location.pathname,
        }),
      });
      setSubmitted(true);
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        setOpen(false);
      }, 1800);
    } catch {
      // Silently fail — feedback is best-effort
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        title="Share feedback"
        className={`fixed bottom-5 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-gray-800/60 text-lg backdrop-blur-sm shadow-lg border border-gray-700/50 transition-all duration-200 hover:bg-gray-700/80 hover:scale-110 hover:shadow-xl hover:border-gray-600 ${open ? "opacity-0 pointer-events-none" : "opacity-60"}`}
        aria-label="Share feedback"
      >
        💬
      </button>

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-20 right-5 z-50 animate-fade-in rounded-xl border border-green-500/30 bg-green-600/20 px-4 py-3 text-sm text-green-300 backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-2">
            <span>✓</span> Thanks!
          </div>
        </div>
      )}

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            {submitted ? (
              <div className="text-center py-4">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 text-2xl">
                  ✓
                </div>
                <p className="text-lg font-semibold text-white">Thank you!</p>
                <p className="mt-1 text-sm text-gray-400">Your feedback helps us improve.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-semibold text-white">How&apos;s your experience?</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Emoji rating */}
                <div className="flex justify-center gap-2 mb-5">
                  {EMOJIS.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => setRating(i)}
                      title={LABELS[i]}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-all duration-150 ${
                        rating === i
                          ? "bg-indigo-600/30 border-2 border-indigo-500 scale-110 shadow-lg shadow-indigo-500/20"
                          : "bg-gray-800/60 border-2 border-transparent hover:bg-gray-700/60 hover:scale-105"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Optional text field */}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us more... (optional)"
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={rating === null || submitting}
                  className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {submitting ? "Submitting…" : "Submit Feedback"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
