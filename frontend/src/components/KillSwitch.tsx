import { useState } from 'react'

interface KillSwitchProps {
  agentId: string
  status: string
  onControl: (mode: string) => void
  onEvolve: () => void
  onResume: () => void
  onFix: (instruction: string) => void
  isLoading?: boolean
}

export default function KillSwitch({
  agentId,
  status,
  onControl,
  onEvolve,
  onResume,
  onFix,
  isLoading = false,
}: KillSwitchProps) {
  const [showHardConfirm, setShowHardConfirm] = useState(false)
  const [showFix, setShowFix] = useState(false)
  const [fixText, setFixText] = useState('')

  const isEvolving = status === 'evolving'
  const isPaused = status === 'paused' || status === 'paused_safe' || status === 'paused_unsafe'
  const isStopped = status === 'stopped' || status === 'idle'

  const handleHardStop = () => {
    onControl('hard_stop')
    setShowHardConfirm(false)
  }

  const handleFix = () => {
    if (fixText.trim()) {
      onFix(fixText.trim())
      setFixText('')
      setShowFix(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Primary action buttons */}
      <div className="flex flex-wrap gap-1.5">
        {/* EVOLVE / RESUME button */}
        {isStopped || isPaused ? (
          <button
            onClick={isPaused ? onResume : onEvolve}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
                       bg-gradient-to-r from-emerald-600 to-cyan-600 text-white
                       hover:from-emerald-500 hover:to-cyan-500 transition-all duration-200
                       hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>▶</span>
            <span>{isPaused ? 'Resume' : 'Evolve'}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
                         bg-emerald-900/30 text-emerald-400/60 border border-emerald-500/20">
            <span className="animate-spin-slow inline-block">⚙</span>
            <span>Evolving...</span>
          </div>
        )}

        {/* SOFT STOP */}
        {isEvolving && (
          <button
            onClick={() => onControl('soft_stop')}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-amber-900/30 text-amber-400 border border-amber-500/30
                       hover:bg-amber-900/50 transition-all duration-200
                       disabled:opacity-50"
          >
            <span>⏹</span>
            <span>Stop After Task</span>
          </button>
        )}

        {/* PAUSE */}
        {isEvolving && (
          <button
            onClick={() => onControl('pause')}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-blue-900/30 text-blue-400 border border-blue-500/30
                       hover:bg-blue-900/50 transition-all duration-200
                       disabled:opacity-50"
          >
            <span>⏸</span>
            <span>Pause</span>
          </button>
        )}

        {/* HARD STOP */}
        {isEvolving && (
          <>
            {showHardConfirm ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                             bg-red-900/40 border border-red-500/50 animate-slide-up">
                <span className="text-red-300">Are you sure?</span>
                <button
                  onClick={handleHardStop}
                  className="px-2 py-0.5 bg-red-600 text-white rounded font-semibold
                             hover:bg-red-500 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowHardConfirm(false)}
                  className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded
                             hover:bg-slate-600 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowHardConfirm(true)}
                disabled={isLoading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                           bg-red-900/30 text-red-400 border border-red-500/30
                           hover:bg-red-900/50 transition-all duration-200
                           disabled:opacity-50"
              >
                <span>🛑</span>
                <span>Hard Stop</span>
              </button>
            )}
          </>
        )}

        {/* FIX */}
        <button
          onClick={() => setShowFix(!showFix)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-violet-900/30 text-violet-400 border border-violet-500/30
                     hover:bg-violet-900/50 transition-all duration-200"
        >
          <span>🔧</span>
          <span>Fix</span>
        </button>
      </div>

      {/* Fix instruction input */}
      {showFix && (
        <div className="flex gap-2 animate-slide-up">
          <input
            type="text"
            value={fixText}
            onChange={(e) => setFixText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFix()}
            placeholder="What do I need to fix?"
            className="flex-1 px-3 py-1.5 text-xs rounded-lg
                       bg-bg-panel border border-border-default text-text-primary
                       placeholder:text-text-muted focus:outline-none
                       focus:border-violet-500/50 transition-colors"
            autoFocus
          />
          <button
            onClick={handleFix}
            disabled={!fixText.trim()}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg
                       bg-violet-600 text-white hover:bg-violet-500
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}
