import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

const ContextMenu = ({ x, y, options, onClose }) => {
    const menuRef = useRef(null);
    const [position, setPosition] = useState({ top: y, left: x });
    const [activeSubmenu, setActiveSubmenu] = useState(null);

    // Adjust position to stay within viewport bounds
    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let newTop = y;
            let newLeft = x;

            if (y + rect.height > window.innerHeight - 50) {
                newTop = y - rect.height;
            }
            if (x + rect.width > window.innerWidth - 20) {
                newLeft = x - rect.width;
            }
            if (newTop < 10) newTop = 10;
            if (newLeft < 10) newLeft = 10;

            setPosition({ top: newTop, left: newLeft });
        }
    }, [x, y]);

    // Close listeners — delayed to avoid the opening event triggering close
    useEffect(() => {
        const handleClick = (e) => {
            // Don't close if clicking inside the menu
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            onClose();
        };
        const handleScroll = () => onClose();
        const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };

        // Delay listener attachment so the opening event doesn't immediately close us
        const timer = setTimeout(() => {
            window.addEventListener('mousedown', handleClick);
            window.addEventListener('scroll', handleScroll, true);
            window.addEventListener('keydown', handleEscape);
        }, 50);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('mousedown', handleClick);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    // Close on right-click outside
    useEffect(() => {
        const handleContextMenu = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        };
        const timer = setTimeout(() => {
            window.addEventListener('contextmenu', handleContextMenu);
        }, 100);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [onClose]);

    const handleItemClick = useCallback((opt) => {
        if (opt.disabled || opt.submenu) return;
        opt.action();
        onClose();
    }, [onClose]);

    return (
        <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
            className="fixed z-[99999] py-1.5 min-w-[260px] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_1px_rgba(255,255,255,0.1)] border border-white/[0.08] overflow-visible"
            style={{
                top: position.top,
                left: position.left,
                background: 'rgba(32, 32, 40, 0.92)',
                backdropFilter: 'blur(24px) saturate(180%)',
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
            {/* Acrylic noise overlay */}
            <div className="absolute inset-0 rounded-xl opacity-[0.03] pointer-events-none" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }} />

            <div className="relative z-10">
                {options.map((opt, idx) => (
                    opt.divider ? (
                        <div key={`div-${idx}`} className="h-[1px] bg-white/[0.06] my-1 mx-3"></div>
                    ) : (
                        <div
                            key={`opt-${idx}`}
                            className="relative"
                            onMouseEnter={() => opt.submenu && setActiveSubmenu(idx)}
                            onMouseLeave={() => opt.submenu && setActiveSubmenu(null)}
                        >
                            <button
                                onClick={() => handleItemClick(opt)}
                                className={`w-full px-3 py-[7px] text-[12px] flex items-center gap-2.5 transition-all duration-100 text-left group cursor-default text-start ${opt.disabled
                                    ? 'opacity-40 cursor-not-allowed text-gray-500'
                                    : 'text-gray-200 hover:bg-white/[0.06] active:bg-white/[0.09]'
                                    }`}
                            >
                                <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${opt.disabled ? '' : 'text-gray-400 group-hover:text-white'}`}>
                                    {opt.icon && <opt.icon className={`w-[14px] h-[14px] ${opt.color || ''}`} />}
                                </div>
                                <span className="flex-1 tracking-tight font-medium">{opt.label}</span>
                                {opt.shortcut && (
                                    <span className="text-[10px] text-gray-500 font-mono tracking-wider ms-4">{opt.shortcut}</span>
                                )}
                                {opt.submenu && (
                                    <ChevronRight className="w-3 h-3 text-gray-500 ms-2 rtl:rotate-180" />
                                )}
                            </button>

                            {/* Submenu */}
                            <AnimatePresence>
                                {opt.submenu && activeSubmenu === idx && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -4, transition: { duration: 0.08 } }}
                                        className="absolute ltr:left-full rtl:right-full top-0 ltr:ml-0.5 rtl:mr-0.5 py-1.5 min-w-[200px] rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.8)] border border-white/[0.08]"
                                        style={{
                                            background: 'rgba(32, 32, 40, 0.95)',
                                            backdropFilter: 'blur(24px) saturate(180%)',
                                        }}
                                    >
                                        {opt.submenu.map((sub, subIdx) => (
                                            sub.divider ? (
                                                <div key={`sub-div-${subIdx}`} className="h-[1px] bg-white/[0.06] my-1 mx-3"></div>
                                            ) : (
                                                <button
                                                    key={`sub-${subIdx}`}
                                                    onClick={() => { sub.action(); onClose(); }}
                                                    className={`w-full px-3 py-[7px] text-[12px] flex items-center gap-2.5 transition-all duration-100 text-start group cursor-default ${sub.active
                                                        ? 'text-cyan-400 bg-cyan-500/[0.08]'
                                                        : 'text-gray-200 hover:bg-white/[0.06]'
                                                        }`}
                                                >
                                                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                                        {sub.icon && <sub.icon className={`w-[14px] h-[14px] ${sub.color || ''}`} />}
                                                        {sub.active && !sub.icon && (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
                                                        )}
                                                    </div>
                                                    <span className="flex-1 font-medium">{sub.label}</span>
                                                    {sub.shortcut && (
                                                        <span className="text-[10px] text-gray-500 font-mono">{sub.shortcut}</span>
                                                    )}
                                                </button>
                                            )
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )
                ))}
            </div>
        </motion.div>
    );
};

export default ContextMenu;
