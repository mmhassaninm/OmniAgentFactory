import { NavLink, Outlet } from 'react-router-dom'
import { Shield, Cpu, Key, Settings, Activity, Workflow, DollarSign, ShoppingBag, Brain } from 'lucide-react'
import { useFactoryStatus } from '../hooks/useAgent'

export default function MainLayout() {
  const { data: factoryStatus, isError } = useFactoryStatus()
  const isOnline = !!factoryStatus && !isError

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060a12] text-[#f0f4f8]">
      {/* ── Fixed Left Sidebar ─────────────────────────────────────────── */}
      <aside className="w-[260px] h-full bg-[#080c14] border-r border-white/[0.06] flex flex-col justify-between shrink-0 select-none">
        <div>
          {/* Logo Section */}
          <div className="p-6 flex items-center gap-3 border-b border-white/[0.04]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              <Shield size={20} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                OmniBot
              </h1>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider font-mono">
                Agent Factory
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 flex flex-col gap-1">
            <NavLink
              to="/factory"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <Activity size={16} />
              <span>Factory</span>
            </NavLink>

            <NavLink
              to="/dev-loop"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <Workflow size={16} />
              <span>Dev Loop</span>
            </NavLink>

            <NavLink
              to="/money-agent"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border-l-2 border-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <DollarSign size={16} />
              <span>Money Agent</span>
            </NavLink>

            <NavLink
              to="/shopify"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <ShoppingBag size={16} />
              <span>Shopify Factory</span>
            </NavLink>

            <NavLink
              to="/evolution"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-purple-500/15 text-purple-300 border-l-2 border-purple-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <Brain size={16} />
              <span>Evolution</span>
            </NavLink>

            <NavLink
              to="/models"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <Cpu size={16} />
              <span>Models</span>
            </NavLink>

            <NavLink
              to="/settings/keys"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <Key size={16} />
              <span>Key Vault</span>
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `py-2.5 px-4 rounded-lg mx-2 flex items-center gap-3 text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`
              }
            >
              <Settings size={16} />
              <span>Settings</span>
            </NavLink>
          </nav>
        </div>

        {/* Bottom Section: System Status */}
        <div className="p-4 border-t border-white/[0.04] bg-[#05080f]/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              System Status
            </span>
            <span className="text-[10px] font-semibold text-slate-500 font-mono">
              v2.0
            </span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-white/[0.03]">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline
                  ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]'
                  : 'bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]'
              }`}
            />
            <span className="text-xs font-bold font-mono">
              Backend: {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Scrollable Main Content Area ───────────────────────────────── */}
      <main className="flex-1 h-full overflow-y-auto bg-[#060a12]">
        <Outlet />
      </main>
    </div>
  )
}
