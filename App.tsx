import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { ToolType, Message, GeneratedImage, CoderState, VoiceName, GroundingSource, ChatSession, SavedSite, UserProfile, ImageGenState, AudioGenState, SocialGenState } from './types';
import { Icons, INITIAL_HTML } from './constants';
import * as Gemini from './services/geminiService';
import * as Supabase from './services/supabaseService';

// --- Animation Variants ---

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, filter: 'blur(5px)' },
  visible: { 
    opacity: 1, 
    y: 0, 
    filter: 'blur(0px)',
    transition: { duration: 0.4, ease: "easeOut" }
  }
};

const drawerVariants: Variants = {
  hidden: { x: '-100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { x: '-100%', opacity: 0 }
};

// --- Sub Components ---

const BackgroundGradient = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <div className="bg-grid absolute inset-0 z-0"></div>
    <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-zinc-300/30 dark:bg-zinc-800/20 rounded-full blur-[128px] mix-blend-multiply dark:mix-blend-screen animate-blob opacity-50"></div>
    <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-zinc-300/30 dark:bg-zinc-800/20 rounded-full blur-[128px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000 opacity-50"></div>
    <div className="absolute -bottom-32 left-1/3 w-[600px] h-[600px] bg-zinc-300/30 dark:bg-zinc-800/20 rounded-full blur-[128px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000 opacity-50"></div>
  </div>
);

const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-2">
    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
  </div>
);

const NavButton = ({ active, onClick, icon: Icon, label }: any) => (
  <motion.button
    layout
    onClick={onClick}
    className={`flex items-center justify-center p-3 rounded-full transition-all duration-300 relative overflow-hidden group shrink-0 ${
      active 
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 pr-5 pl-4 shadow-lg shadow-zinc-500/20' 
        : 'bg-transparent text-zinc-500 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'
    }`}
  >
    <Icon className="w-5 h-5 relative z-10" />
    {active && (
      <motion.span
        initial={{ opacity: 0, width: 0, marginLeft: 0 }}
        animate={{ opacity: 1, width: 'auto', marginLeft: 8 }}
        exit={{ opacity: 0, width: 0, marginLeft: 0 }}
        className="text-sm font-medium whitespace-nowrap overflow-hidden relative z-10"
      >
        {label}
      </motion.span>
    )}
  </motion.button>
);

const SourcePills = ({ sources }: { sources: GroundingSource[] }) => (
  <div className="mt-3 flex flex-wrap gap-2">
    {sources.map((source, idx) => (
      <a 
        key={idx}
        href={source.uri}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 dark:bg-black/30 border border-zinc-200 dark:border-zinc-700/50 text-[10px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors no-underline group"
      >
        <Icons.Globe className="w-3 h-3 text-zinc-400 group-hover:text-blue-500 transition-colors" />
        <span className="truncate max-w-[150px]">{source.title}</span>
      </a>
    ))}
  </div>
);

const MarkdownRenderer = ({ content, role, sources }: { content: string, role: 'user' | 'model', sources?: GroundingSource[] }) => {
  return (
    <div className="flex flex-col">
      <ReactMarkdown
        components={{
          strong: ({node, ...props}) => <span className={`font-bold ${role === 'model' ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-900'}`} {...props} />,
          em: ({node, ...props}) => <em className="italic opacity-90" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,
          p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed whitespace-pre-wrap" {...props} />,
          h1: ({node, ...props}) => <h1 className={`text-xl font-bold mt-4 mb-2 ${role === 'model' ? 'text-zinc-900 dark:text-zinc-50' : ''}`} {...props} />,
          h2: ({node, ...props}) => <h2 className={`text-lg font-bold mt-3 mb-2 ${role === 'model' ? 'text-zinc-900 dark:text-zinc-50' : ''}`} {...props} />,
          h3: ({node, ...props}) => <h3 className={`font-bold mt-2 mb-1 ${role === 'model' ? 'text-zinc-900 dark:text-zinc-50' : ''}`} {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 py-1 my-2 italic opacity-80" {...props} />,
          code: ({node, inline, className, children, ...props}: any) => {
            return inline
              ? <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${role === 'model' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200' : 'bg-black/10 text-zinc-900'}`} {...props}>{children}</code>
              : <pre className="bg-zinc-950 dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 p-3 rounded-lg overflow-x-auto my-3 text-xs font-mono text-zinc-300 shadow-sm" {...props}><code>{children}</code></pre>
          },
          a: ({node, ...props}) => <a className="underline underline-offset-2 hover:opacity-80 transition-opacity font-medium" target="_blank" rel="noopener noreferrer" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
      
      {sources && sources.length > 0 && <SourcePills sources={sources} />}
    </div>
  );
};

const InputArea = ({ value, onChange, onSubmit, placeholder, loading, buttonLabel = "Gerar" }: any) => (
  <div className="flex gap-2 w-full max-w-3xl mx-auto mt-4 relative group z-20">
    <div className="absolute -inset-0.5 bg-gradient-to-r from-zinc-300 via-zinc-400 to-zinc-300 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700 rounded-2xl blur opacity-20 group-hover:opacity-60 transition duration-500 group-focus-within:opacity-100"></div>
    <div className="relative flex w-full bg-white dark:bg-black rounded-xl items-center p-1.5 shadow-xl border border-zinc-200/50 dark:border-zinc-800/50">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && onSubmit()}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none px-4 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-base"
        />
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-5 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 shadow-sm"
        >
          {loading ? '...' : (
             <>
               <span className="hidden sm:inline">{buttonLabel}</span>
               <Icons.Send className="w-3.5 h-3.5" />
             </>
          )}
        </button>
    </div>
  </div>
);

const ExpandedInput = ({ value, onChange, onSend, onNavigate, placeholder, loading, btnLabel = "Começar" }: any) => (
  <div className="w-full relative group z-20">
    <div className="absolute -inset-0.5 bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-200 dark:from-zinc-800 dark:via-zinc-600 dark:to-zinc-800 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-700"></div>
    <div className="relative bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 shadow-2xl flex flex-col">
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
                if(e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading && value.trim()) onSend();
                }
            }}
            placeholder={placeholder}
            className="w-full bg-transparent border-none outline-none text-lg p-4 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 resize-none h-24 custom-scrollbar"
        />
        <div className="flex justify-between items-center px-2 pb-2 mt-2">
            <div className="flex gap-1">
               <button onClick={() => onNavigate('image')} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" title="Gerar Imagem">
                  <Icons.Image className="w-5 h-5" />
               </button>
               <button onClick={() => onNavigate('code')} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" title="Criar Site">
                  <Icons.Code className="w-5 h-5" />
               </button>
            </div>
            <button 
               onClick={onSend}
               disabled={loading || !value.trim()}
               className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg px-6 py-2.5 font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
            >
               {loading ? '...' : <>{btnLabel} <Icons.Send className="w-3.5 h-3.5" /></>}
            </button>
        </div>
    </div>
  </div>
);

// --- Upgrade Modal Component ---
const UpgradeModal = ({ isOpen, onClose, onCheckPayment }: { isOpen: boolean; onClose: () => void; onCheckPayment: () => void }) => {
    const [checking, setChecking] = useState(false);

    if (!isOpen) return null;

    const handleCheck = async () => {
        setChecking(true);
        await onCheckPayment();
        setTimeout(() => setChecking(false), 2000); // Minimum feedback delay
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="bg-white dark:bg-[#09090b] w-full max-w-md rounded-3xl p-8 border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden"
                >
                    {/* Background decoration */}
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
                    <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="relative z-10 text-center">
                        <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-200 dark:border-zinc-800">
                             <Icons.Sparkles className="w-8 h-8 text-yellow-500" />
                        </div>
                        
                        <h2 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">Limite de Créditos Atingido</h2>
                        <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-sm leading-relaxed">
                            Você utilizou seus 10 créditos gratuitos. Desbloqueie acesso ilimitado e continue criando sem barreiras.
                        </p>

                        <div className="flex flex-col gap-3">
                             <a 
                                href="https://pay.cakto.com.br/kt6v8w3_674199" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 dark:from-white dark:to-zinc-200 text-white dark:text-zinc-950 font-bold shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                             >
                                Assinar Pro — R$29,90/mês <Icons.ArrowRight className="w-4 h-4" />
                             </a>
                             <button
                                onClick={handleCheck}
                                disabled={checking}
                                className="w-full py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex items-center justify-center gap-2"
                             >
                                {checking ? <LoadingSpinner /> : "Já realizei o pagamento"}
                             </button>
                             <button 
                                onClick={onClose}
                                className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 font-medium transition-colors"
                             >
                                Agora não
                             </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// --- Shatter Button Component ---
export interface ShatterButtonProps {
  children: ReactNode
  className?: string
  shardCount?: number
  shatterColor?: string
  onClick?: () => void
  disabled?: boolean
}

interface Shard {
  id: number
  x: number
  y: number
  rotation: number
  velocityX: number
  velocityY: number
  size: number
}

const ShatterButton: React.FC<ShatterButtonProps> = ({
  children,
  className = "",
  shardCount = 20,
  shatterColor = "var(--shatter-color)",
  onClick,
  disabled
}) => {
  const [isShattered, setIsShattered] = useState(false)
  const [shards, setShards] = useState<Shard[]>([])

  const handleClick = useCallback(() => {
    if (isShattered || disabled) return

    const newShards: Shard[] = []
    for (let i = 0; i < shardCount; i++) {
      const angle = (Math.PI * 2 * i) / shardCount + Math.random() * 0.5
      const velocity = 100 + Math.random() * 200
      newShards.push({
        id: i,
        x: 0,
        y: 0,
        rotation: Math.random() * 720 - 360,
        velocityX: Math.cos(angle) * velocity,
        velocityY: Math.sin(angle) * velocity,
        size: 4 + Math.random() * 12,
      })
    }

    setShards(newShards)
    setIsShattered(true)
    onClick?.()

    setTimeout(() => {
      setIsShattered(false)
      setShards([])
    }, 1000)
  }, [isShattered, shardCount, onClick, disabled])

  return (
    <div className="relative inline-block w-full">
      <motion.button
        className={`relative w-full px-8 py-4 font-semibold rounded-xl overflow-hidden ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        animate={{
          scale: isShattered ? 0 : 1,
          opacity: isShattered ? 0 : 1,
        }}
        transition={{ duration: 0.15 }}
        whileHover={disabled ? {} : { scale: 1.02 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
        style={{
           backgroundColor: "var(--btn-bg)",
           color: "var(--btn-text)",
        }}
      >
        <span className="relative z-10">{children}</span>
      </motion.button>

      <AnimatePresence>
        {shards.map((shard) => (
          <motion.div
            key={shard.id}
            className="absolute pointer-events-none"
            initial={{
              x: 0,
              y: 0,
              rotate: 0,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              x: shard.velocityX,
              y: shard.velocityY,
              rotate: shard.rotation,
              opacity: 0,
              scale: 0.5,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.8,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            style={{
              left: "50%",
              top: "50%",
              width: shard.size,
              height: shard.size,
              background: shatterColor,
              borderRadius: '2px',
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

// --- Auth Components ---

const LandingPage: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -50 }}
      className="h-screen w-full flex flex-col items-center justify-center relative z-20 overflow-hidden"
    >
      <motion.div
         initial={{ opacity: 0, scale: 0.9 }}
         animate={{ opacity: 1, scale: 1 }}
         transition={{ duration: 1, ease: "easeOut" }}
         className="text-center"
      >
         <h1 className="text-8xl md:text-9xl font-bold tracking-tighter text-zinc-900 dark:text-white mb-2">AXIUM</h1>
         <p className="text-xl md:text-2xl text-zinc-500 font-light tracking-[0.5em] uppercase mb-12">The Future of Creation</p>
         
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.5, duration: 0.8 }}
         >
           <button 
             onClick={onStart}
             className="relative group cursor-pointer border-none bg-transparent p-0 outline-none"
           >
             <div className="absolute inset-0 rounded-2xl p-[2px] bg-[radial-gradient(circle_80px_at_80%_-10%,#ffffff,#181b1b)]">
                <div className="absolute bottom-0 left-0 w-[70px] h-full rounded-2xl bg-[radial-gradient(circle_60px_at_0%_100%,#d4d4d8,#52525b40,transparent)] shadow-[-10px_10px_30px_rgba(255,255,255,0.1)]"></div>
             </div>
             <div className="absolute top-0 right-0 w-[65%] h-[60%] rounded-[120px] shadow-[0_0_20px_rgba(255,255,255,0.2)] -z-10"></div>
             <div className="relative z-10 rounded-[14px] bg-[radial-gradient(circle_80px_at_80%_-50%,#3f3f46,#09090b)] overflow-hidden">
               <div className="absolute inset-0 bg-[radial-gradient(circle_60px_at_0%_100%,#ffffff15,transparent)]"></div>
               <div className="relative z-20 flex items-center gap-3 px-10 py-4 text-white">
                  <span className="font-bold tracking-[0.2em] text-sm uppercase">
                      Acessar Plataforma
                  </span>
                  <Icons.ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
               </div>
             </div>
           </button>
         </motion.div>
      </motion.div>
      
      <div className="absolute bottom-10 text-xs text-zinc-400 font-mono opacity-50">
        POWERED BY AXIUM INTELLIGENCE
      </div>
    </motion.div>
  );
};

const LoginPage: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Password Reset States
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [resetEmail, setResetEmail] = useState("");
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleSubmit = async () => {
        if(!email || !password) {
            setError("Preencha todos os campos.");
            return;
        }
        setLoading(true);
        setError(null);

        try {
            if(mode === 'login') {
                await Supabase.signIn(email, password);
            } else {
                await Supabase.signUp(email, password);
            }
            onLogin();
        } catch(e: any) {
            console.error(e);
            if(e.message) {
                 if(e.message.includes("Invalid login")) setError("Email ou senha incorretos.");
                 else if(e.message.includes("User already registered")) setError("Este e-mail já está cadastrado. Tente fazer login.");
                 else if(e.message.includes("Email not confirmed")) setError("Verifique seu e-mail para confirmar a conta.");
                 else setError(e.message);
            } else {
                setError("Ocorreu um erro. Tente novamente.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!resetEmail) {
            setResetMessage({ type: 'error', text: "Digite seu e-mail." });
            return;
        }
        setResetLoading(true);
        setResetMessage(null);
        try {
            await Supabase.resetPassword(resetEmail);
            setResetMessage({ type: 'success', text: "Link de redefinição enviado! Verifique seu e-mail." });
        } catch (e: any) {
            setResetMessage({ type: 'error', text: "Erro ao enviar link. Verifique o e-mail." });
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            className="flex flex-col items-center justify-center h-screen w-full relative z-30 px-4"
        >
            <div className="w-full max-w-md bg-white/10 dark:bg-black/40 backdrop-blur-2xl border border-white/20 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
                        {mode === 'login' ? 'Bem-vindo de volta' : 'Criar Conta'}
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {mode === 'login' ? 'Entre para continuar criando.' : 'Junte-se ao futuro da criação.'}
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="relative group">
                        <Icons.User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Seu e-mail"
                            className="w-full bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-12 pr-4 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                    <div className="relative group">
                        <Icons.Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Sua senha"
                            className="w-full bg-white/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl py-3 pl-12 pr-4 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors text-zinc-900 dark:text-zinc-100"
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>
                </div>

                {/* Forgot Password Link */}
                {mode === 'login' && (
                    <div className="flex justify-end mt-2">
                        <button 
                            onClick={() => setShowForgotPassword(true)}
                            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
                        >
                            Esqueceu a senha?
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs text-center">
                        {error}
                    </div>
                )}

                <div className="mt-8 relative" style={{'--btn-bg': '#fafafa', '--btn-text': '#09090b'} as React.CSSProperties}>
                    <style>{`
                        .dark { --btn-bg: #fafafa; --btn-text: #09090b; --shatter-color: #ffffff; }
                        :not(.dark) { --btn-bg: #18181b; --btn-text: #ffffff; --shatter-color: #000000; }
                    `}</style>
                    <ShatterButton 
                        onClick={handleSubmit} 
                        shardCount={15} 
                        shatterColor="var(--shatter-color)"
                        className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        disabled={loading}
                    >
                        {loading ? 'Processando...' : (mode === 'login' ? 'Entrar' : 'Cadastrar')}
                    </ShatterButton>
                </div>

                <div className="mt-6 text-center">
                    <button 
                        onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
                        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors underline underline-offset-4"
                    >
                        {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entre'}
                    </button>
                </div>
            </div>

            {/* Password Reset Modal */}
            <AnimatePresence>
                {showForgotPassword && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-xl relative"
                        >
                            <button 
                                onClick={() => { setShowForgotPassword(false); setResetMessage(null); setResetEmail(""); }}
                                className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                            >
                                <Icons.X className="w-5 h-5" />
                            </button>
                            
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Redefinir Senha</h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                                Digite seu e-mail para receber um link de redefinição.
                            </p>

                            <input 
                                type="email" 
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                placeholder="Seu e-mail cadastrado"
                                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg py-2 px-3 outline-none text-zinc-900 dark:text-zinc-100 mb-4"
                            />

                            {resetMessage && (
                                <div className={`mb-4 p-2 rounded text-xs text-center ${resetMessage.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                    {resetMessage.text}
                                </div>
                            )}

                            <button 
                                onClick={handleResetPassword}
                                disabled={resetLoading}
                                className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg py-2 font-medium disabled:opacity-50"
                            >
                                {resetLoading ? 'Enviando...' : 'Enviar Link'}
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};


// --- Tool Components ---

interface ToolProps {
    setActiveTool: (t: ToolType) => void;
    onAuthError: () => void;
    profile: UserProfile | null;
    onConsume: () => void;
    onLimitReached: () => void;
    savedState?: any;
    saveState?: (state: any) => void;
}

const ChatTool = ({ setActiveTool, onAuthError, profile, onConsume, onLimitReached }: ToolProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadChats = async () => {
        try {
            const fetchedChats = await Supabase.getChats();
            setChats(fetchedChats);
        } catch(e) {
            console.error("Failed to load chats", e);
        }
    };
    loadChats();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const loadChat = (chat: ChatSession) => {
      setCurrentChatId(chat.id);
      setMessages(chat.messages);
      setIsSidebarOpen(false);
  };

  const startNewChat = () => {
      setCurrentChatId(null);
      setMessages([]);
      setIsSidebarOpen(false);
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim()) return;

    // CREDIT CHECK
    if (profile && profile.plan === 'free' && profile.credits <= 0) {
        onLimitReached();
        return;
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: textToSend, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      let chatId = currentChatId;
      if (!chatId) {
          try {
              const newChat = await Supabase.createChat();
              chatId = newChat.id;
              setCurrentChatId(chatId);
              setChats(prev => [newChat, ...prev]);
          } catch(e: any) {
              if (e.message && (e.message.includes("autenticado") || e.message.includes("JWT"))) {
                  onAuthError();
                  return;
              }
              throw e;
          }
      }

      const apiHistory = messages.map(h => ({
        role: h.role,
        parts: [{ text: h.content }]
      }));
      
      const { text, sources } = await Gemini.generateTextChat(apiHistory, userMsg.content);
      
      const modelMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'model', 
          content: text || "Erro ao gerar resposta", 
          timestamp: Date.now(),
          sources: sources
      };
      
      const updatedMessages = [...newMessages, modelMsg];
      setMessages(updatedMessages);

      let title: string | undefined;
      if (updatedMessages.length === 2) {
          const generatedTitle = await Gemini.generateChatTitle(userMsg.content);
          title = generatedTitle;
          setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: generatedTitle } : c));
      }

      await Supabase.updateChat(chatId, updatedMessages, title);
      
      // Consume Credit
      onConsume();

    } catch (e: any) {
      console.error(e);
      if (e.message && (e.message.includes("autenticado") || e.message.includes("JWT"))) {
          onAuthError();
          return;
      }
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', content: "Desculpe, encontrei um erro de conexão. Tente novamente.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (type: 'image' | 'code') => {
      if (type === 'image') setActiveTool(ToolType.ImageGen);
      if (type === 'code') setActiveTool(ToolType.Coder);
  };

  const suggestions = [
      "Criar um site de portfólio",
      "Gerar uma imagem cyberpunk",
      "Explique computação quântica",
      "Melhorar meu texto de vendas"
  ];

  return (
    <>
      <AnimatePresence>
        {isSidebarOpen && (
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            />
        )}
      </AnimatePresence>

      <AnimatePresence>
         {isSidebarOpen && (
             <motion.div
                variants={drawerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="fixed left-0 top-0 bottom-0 w-72 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 z-50 flex flex-col shadow-2xl"
             >
                 <div className="p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
                     <span className="font-bold text-lg tracking-tight text-metallic">Histórico</span>
                     <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg">
                         <Icons.X className="w-5 h-5 text-zinc-500" />
                     </button>
                 </div>
                 <div className="p-4">
                     <button onClick={startNewChat} className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity">
                         <Icons.Plus className="w-4 h-4" /> Novo Chat
                     </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1">
                     {chats.map(chat => (
                         <button 
                            key={chat.id}
                            onClick={() => loadChat(chat)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors truncate ${currentChatId === chat.id ? 'bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                         >
                             {chat.title}
                         </button>
                     ))}
                 </div>
             </motion.div>
         )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {messages.length === 0 ? (
            <motion.div 
               key="hero"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
               transition={{ duration: 0.5 }}
               className="flex flex-col items-center justify-center h-full px-4 relative z-10 pb-20"
            >
                 <div className="absolute top-4 left-4">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-white/50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                        <Icons.Menu className="w-6 h-6" />
                    </button>
                 </div>

                <motion.div 
                   initial={{ opacity: 0, y: 30 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.8, ease: "easeOut" }}
                   className="text-center mb-10 w-full max-w-4xl"
                >
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, duration: 0.5 }}
                      className="flex items-center justify-center gap-2 mb-8"
                    >
                         <div className="relative group cursor-default">
                             <div className="absolute -inset-1 bg-gradient-to-r from-zinc-200 to-zinc-400 dark:from-zinc-800 dark:to-zinc-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                             <div className="relative px-4 py-1.5 rounded-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shadow-sm backdrop-blur-md">
                                 <span className="relative flex h-2 w-2">
                                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                   <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                 </span>
                                 <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-600 dark:text-zinc-400">Axium Intelligence</span>
                             </div>
                         </div>
                    </motion.div>
                    
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 text-zinc-900 dark:text-white">
                        Crie algo <span className="text-metallic">Extraordinário</span>
                    </h1>
                    <p className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed">
                        Sua central de criação. Desenvolva apps, gere arte e otimize conteúdo conversando com a IA.
                    </p>
                </motion.div>

                <motion.div 
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   transition={{ delay: 0.3, duration: 0.5 }}
                   className="w-full max-w-2xl"
                >
                    <ExpandedInput 
                        value={input} 
                        onChange={setInput} 
                        onSend={() => handleSend()} 
                        onNavigate={handleNavigate}
                        placeholder="O que vamos criar hoje?"
                        loading={loading}
                    />
                </motion.div>

                <motion.div 
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   transition={{ delay: 0.5, duration: 0.5 }}
                   className="mt-8 flex flex-wrap justify-center gap-3 max-w-3xl px-4"
                >
                    {suggestions.map((s, i) => (
                        <button 
                          key={i} 
                          onClick={() => handleSend(s)}
                          className="px-4 py-2 rounded-full bg-white/40 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all backdrop-blur-sm shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600"
                        >
                            {s}
                        </button>
                    ))}
                </motion.div>
            </motion.div>
        ) : (
            <motion.div 
               key="chat"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95 }}
               transition={{ duration: 0.4 }}
               className="flex flex-col h-full max-w-4xl mx-auto pb-6 px-4 pt-8 relative z-10"
            >
              <div className="flex justify-between items-center mb-6 px-2 border-b border-zinc-200/50 dark:border-zinc-800/50 pb-4">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500">
                          <Icons.Menu className="w-5 h-5" />
                      </button>
                      <h2 className="text-xl font-bold tracking-tight text-metallic truncate max-w-[200px] md:max-w-md">
                          {chats.find(c => c.id === currentChatId)?.title || "Chat Axium"}
                      </h2>
                  </div>
                  <button 
                    onClick={startNewChat} 
                    className="group flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all shadow-sm"
                    title="Novo Chat"
                  >
                    <Icons.Plus className="w-5 h-5" />
                  </button>
              </div>

              <motion.div 
                className="flex-1 overflow-y-auto space-y-6 mb-4 pr-2 scroll-smooth"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {messages.map(msg => (
                  <motion.div 
                    key={msg.id} 
                    variants={itemVariants}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[90%] sm:max-w-[75%] rounded-[20px] px-6 py-4 shadow-sm backdrop-blur-md border ${
                      msg.role === 'user' 
                        ? 'bg-zinc-100 dark:bg-zinc-200 text-zinc-900 border-zinc-200 dark:border-white rounded-tr-md font-medium' 
                        : 'bg-white/80 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800/80 rounded-tl-md'
                    }`}>
                      <MarkdownRenderer content={msg.content} role={msg.role} sources={msg.sources} />
                    </div>
                  </motion.div>
                ))}
                {loading && (
                  <motion.div variants={itemVariants} className="flex justify-start">
                     <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 rounded-[20px] rounded-tl-md px-5 py-4 flex items-center gap-1.5 shadow-sm backdrop-blur-md">
                       <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce"></span>
                       <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce delay-100"></span>
                       <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce delay-200"></span>
                     </div>
                  </motion.div>
                )}
                <div ref={endRef} />
              </motion.div>
              
              <div className="pt-2 pb-24 md:pb-8">
                 <ExpandedInput 
                    value={input} 
                    onChange={setInput} 
                    onSend={() => handleSend()} 
                    onNavigate={handleNavigate}
                    placeholder="Digite sua mensagem..."
                    loading={loading}
                    btnLabel="Enviar"
                />
              </div>
            </motion.div>
        )}
    </AnimatePresence>
    </>
  );
};

const ImageTool = ({ profile, onConsume, onLimitReached, savedState, saveState }: ToolProps) => {
  // Use saved state or defaults
  const [prompt, setPrompt] = useState(savedState?.prompt || "");
  const [loading, setLoading] = useState(false);
  const [activeImage, setActiveImage] = useState<GeneratedImage | null>(savedState?.activeImage || null);
  const [history, setHistory] = useState<GeneratedImage[]>(savedState?.history || []);

  useEffect(() => {
    // Only load from DB if no history in state
    if (history.length === 0) {
        const load = async () => {
            const imgs = await Supabase.getImages();
            setHistory(imgs);
            if (imgs.length > 0 && !activeImage) setActiveImage(imgs[0]);
        };
        load();
    }
  }, []);

  // Update parent state on changes
  useEffect(() => {
    saveState?.({ prompt, activeImage, history });
  }, [prompt, activeImage, history, saveState]);


  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    if (profile && profile.plan === 'free' && profile.credits <= 0) {
        onLimitReached?.();
        return;
    }

    setLoading(true);
    try {
      const url = await Gemini.generateImage(prompt);
      const newImg: GeneratedImage = { id: Date.now().toString(), url, prompt, timestamp: Date.now() };
      await Supabase.saveImage(url, prompt);
      
      setHistory(prev => [newImg, ...prev]);
      setActiveImage(newImg);
      setPrompt("");
      
      onConsume?.();
    } catch (e: any) {
      alert("Falha ao gerar imagem: " + (e.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `axium-img-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="flex flex-col h-full items-center px-4 pt-8 pb-28 overflow-y-auto relative z-10">
      <div className="w-full max-w-2xl mb-10">
        <div className="text-center mb-6">
            <h2 className="text-3xl font-bold mb-2 text-metallic">Gerador de Imagem</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-light">Descreva com detalhes para resultados impressionantes.</p>
        </div>
        <InputArea value={prompt} onChange={setPrompt} onSubmit={handleGenerate} loading={loading} placeholder="Descreva uma imagem..." buttonLabel="Criar" />
      </div>
      
      {loading ? (
        <div className="w-full max-w-lg aspect-square bg-zinc-100/50 dark:bg-zinc-900/30 backdrop-blur-md rounded-3xl flex items-center justify-center border border-zinc-200/50 dark:border-zinc-800/50 shadow-inner">
           <div className="flex flex-col items-center gap-4">
             <div className="relative">
                <div className="absolute inset-0 bg-zinc-400 blur-xl opacity-20 animate-pulse"></div>
                <Icons.Sparkles className="w-10 h-10 text-zinc-400 animate-spin relative z-10" />
             </div>
             <span className="text-zinc-500 text-xs tracking-widest uppercase font-medium">Renderizando...</span>
           </div>
        </div>
      ) : activeImage ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative group w-full max-w-lg"
        >
          <div className="absolute -inset-4 bg-gradient-to-t from-zinc-200 to-transparent dark:from-zinc-800 dark:to-transparent rounded-[30px] blur-2xl opacity-40"></div>
          <img src={activeImage.url} alt={activeImage.prompt} className="relative w-full aspect-square object-cover rounded-3xl shadow-2xl border border-white/50 dark:border-zinc-700/50 ring-1 ring-black/5 dark:ring-white/5" />
          
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl flex items-center justify-center gap-4 backdrop-blur-sm">
             <button 
                onClick={() => downloadImage(activeImage.url)}
                className="bg-white/90 text-black px-6 py-2.5 rounded-full font-medium hover:scale-105 transition-transform flex items-center gap-2 shadow-lg backdrop-blur-md"
              >
                <Icons.Download className="w-4 h-4" /> Baixar
              </button>
          </div>
          <p className="mt-6 text-center text-sm text-zinc-500 font-light italic truncate max-w-md mx-auto">{activeImage.prompt}</p>
        </motion.div>
      ) : (
        <div className="w-full max-w-lg aspect-square bg-zinc-50/50 dark:bg-zinc-900/20 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-800">
          <Icons.Image className="w-12 h-12 mb-4 opacity-20" />
          <h3 className="font-semibold text-xl mb-2 text-metallic">Sua criação aguarda</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-500 text-center max-w-xs px-4 leading-relaxed">
            Da imaginação para a tela. Gere imagens de alta fidelidade com detalhes impressionantes.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-5xl mt-16 px-4"
        >
          <div className="flex items-center gap-4 mb-6">
             <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-800 to-transparent"></div>
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Galeria da Sessão</h3>
             <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-300 dark:via-zinc-800 to-transparent"></div>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
            {history.map(img => (
              <motion.button 
                key={img.id}
                variants={itemVariants}
                onClick={() => setActiveImage(img)} 
                className={`relative aspect-square rounded-xl overflow-hidden border transition-all duration-300 hover:scale-105 ${activeImage?.id === img.id ? 'border-zinc-900 dark:border-zinc-100 ring-2 ring-zinc-200 dark:ring-zinc-800 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
              >
                <img src={img.url} className="w-full h-full object-cover" alt="thumbnail" />
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

const AudioTool = ({ profile, onConsume, onLimitReached, savedState, saveState }: ToolProps) => {
  const [text, setText] = useState(savedState?.text || "");
  const [voice, setVoice] = useState<VoiceName>(savedState?.voice || 'Puck');
  const [audioUrl, setAudioUrl] = useState<string | null>(savedState?.audioUrl || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    saveState?.({ text, voice, audioUrl });
  }, [text, voice, audioUrl, saveState]);

  const handleGenerate = async () => {
    if (!text.trim()) return;

    if (profile && profile.plan === 'free' && profile.credits <= 0) {
        onLimitReached?.();
        return;
    }

    setLoading(true);
    setAudioUrl(null);
    try {
      const url = await Gemini.generateAudio(text, voice);
      setAudioUrl(url);
      onConsume?.();
    } catch (e) {
      alert("Falha ao gerar áudio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center h-full px-4 pt-12 max-w-3xl mx-auto relative z-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2 text-metallic">Texto para Fala</h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-light">Transforme seus roteiros em vozes realistas com qualidade de estúdio.</p>
      </div>
      
      <div className="w-full bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl p-1 rounded-3xl shadow-2xl border border-white/20 dark:border-zinc-800/50">
        <div className="p-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite o texto para converter..."
            className="w-full h-40 bg-transparent resize-none outline-none text-lg leading-relaxed placeholder:text-zinc-300 dark:placeholder:text-zinc-700 text-zinc-800 dark:text-zinc-200"
          />
        </div>
        
        <div className="bg-zinc-50/50 dark:bg-black/20 rounded-[20px] p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-zinc-100/50 dark:border-zinc-800/30 backdrop-blur-sm">
          <div className="flex items-center gap-3 w-full sm:w-auto">
             <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 ml-2">Voz</span>
             <div className="relative">
                <select 
                  value={voice} 
                  onChange={(e) => setVoice(e.target.value as VoiceName)}
                  className="appearance-none bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-4 pr-8 py-2 text-sm focus:outline-none cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                >
                  {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
             </div>
          </div>
          
          <button 
            onClick={handleGenerate} 
            disabled={loading || !text}
            className="w-full sm:w-auto bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-8 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all shadow-lg hover:shadow-xl"
          >
            {loading ? <LoadingSpinner /> : (
              <>
                <span>Gerar Áudio</span>
                <Icons.Audio className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {audioUrl && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-8 w-full p-1 bg-gradient-to-r from-zinc-200 to-zinc-100 dark:from-zinc-800 dark:to-zinc-900 rounded-2xl shadow-xl"
          >
            <div className="bg-white dark:bg-zinc-950 rounded-xl p-5 flex items-center gap-6">
              <div className="p-4 bg-zinc-100 dark:bg-zinc-900 rounded-full border border-zinc-200 dark:border-zinc-800">
                <Icons.Play className="w-6 h-6 text-zinc-900 dark:text-zinc-100 ml-1" />
              </div>
              <div className="flex-1">
                 <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-2">Reproduzindo</p>
                 <audio controls src={audioUrl} className="w-full h-8 accent-zinc-900 dark:accent-white" autoPlay />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CoderTool = ({ profile, onConsume, onLimitReached, savedState, saveState }: ToolProps) => {
  const [state, setState] = useState<CoderState>(savedState || {
      html: INITIAL_HTML,
      css: 'body { background: #111; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: "Inter", sans-serif; }',
      js: 'console.log("Sistema pronto.");',
      history: [],
      chatHistory: [],
      logs: []
  });
  
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'console'>('preview');
  const [codeTab, setCodeTab] = useState<'html' | 'css' | 'js'>('html');
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatMode, setChatMode] = useState<'chat' | 'history'>('chat');
  const [iframeKey, setIframeKey] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  useEffect(() => {
    // Save state on changes
    saveState?.(state);
  }, [state, saveState]);

  useEffect(() => {
    // Only fetch history if not already populated (to avoid overwrite)
    if (state.history.length === 0) {
        const load = async () => {
            const sites = await Supabase.getSites();
            setState(prev => ({ ...prev, history: sites }));
        }
        load();
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'axium-log') {
        setState(prev => ({
          ...prev,
          logs: [...prev.logs, {
             type: event.data.level,
             message: event.data.message,
             timestamp: Date.now()
          }]
        }));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fullDoc = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>${state.css}</style>
        <script>
            // Intercept Console Logs
            (function(){
                const oldLog = console.log;
                const oldError = console.error;
                const oldWarn = console.warn;
                const oldInfo = console.info;

                function send(level, args) {
                    try {
                        const msg = args.map(a => 
                            typeof a === 'object' ? JSON.stringify(a) : String(a)
                        ).join(' ');
                        window.parent.postMessage({ type: 'axium-log', level, message: msg }, '*');
                    } catch(e) {}
                }

                console.log = function(...args) { send('log', args); oldLog.apply(console, args); };
                console.error = function(...args) { send('error', args); oldError.apply(console, args); };
                console.warn = function(...args) { send('warn', args); oldWarn.apply(console, args); };
                console.info = function(...args) { send('info', args); oldInfo.apply(console, args); };

                window.onerror = function(msg, url, line) {
                    send('error', [msg + " (Line: " + line + ")"]);
                };
            })();
        </script>
      </head>
      <body>
        ${state.html}
        <script>
          try {
            ${state.js}
          } catch(err) { console.error(err); }
        </script>
      </body>
    </html>
  `;

  const handleCodeUpdate = async () => {
    if (!chatInput.trim()) return;

    if (profile && profile.plan === 'free' && profile.credits <= 0) {
        onLimitReached?.();
        return;
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: chatInput, timestamp: Date.now() };
    setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, userMsg] }));
    setChatInput("");
    setLoading(true);

    try {
      const codeResult = await Gemini.generateCode(chatInput, { html: state.html, css: state.css, js: state.js });
      
      setState(prev => ({
        ...prev,
        html: codeResult.html,
        css: codeResult.css,
        js: codeResult.js,
        chatHistory: [...prev.chatHistory, { id: Date.now().toString(), role: 'model', content: "Código atualizado com sucesso.", timestamp: Date.now() }],
        logs: [] // Clear logs on new run
      }));
      setIframeKey(k => k + 1);
      
      onConsume?.();
    } catch (e) {
      console.error(e);
      setState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, { id: Date.now().toString(), role: 'model', content: "Falha ao atualizar o código. Tente simplificar o pedido.", timestamp: Date.now() }] }));
    } finally {
      setLoading(false);
    }
  };

  const loadVersion = (ver: SavedSite) => {
    setState(prev => ({ ...prev, html: ver.html, css: ver.css, js: ver.js, logs: [] }));
    setIframeKey(k => k + 1);
  };

  const downloadSite = () => {
    const blob = new Blob([fullDoc], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'site-axium.html';
    link.click();
  };

  const saveVersion = async () => {
      // Save to Supabase
      try {
        await Supabase.saveSite(state.html, state.css, state.js, "Versão " + new Date().toLocaleString());
        const sites = await Supabase.getSites();
        setState(prev => ({ ...prev, history: sites }));
        alert("Versão salva com sucesso!");
      } catch(e) {
        alert("Erro ao salvar versão.");
      }
  };

  const openFullScreen = () => {
      const w = window.open("", "_blank");
      if(w) {
          w.document.write(fullDoc);
          w.document.close();
      }
  };

  const getPreviewWidth = () => {
      switch(previewDevice) {
          case 'mobile': return '375px';
          case 'tablet': return '768px';
          default: return '100%';
      }
  };

  const FileItem = ({ name, type, active, onClick }: any) => {
      let Icon = Icons.Code;
      if (type === 'html') Icon = Icons.FileHtml;
      if (type === 'css') Icon = Icons.FileCss;
      if (type === 'js') Icon = Icons.FileJs;

      return (
        <button 
          onClick={onClick}
          className={`flex items-center gap-2 w-full px-4 py-1.5 text-xs font-mono transition-colors border-l-2 ${active ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-blue-500' : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
        >
          <Icon className={`w-4 h-4 ${active ? 'text-blue-500' : 'text-zinc-400'}`} />
          {name}
        </button>
      );
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full overflow-hidden bg-zinc-50 dark:bg-black relative z-10 pb-20 md:pb-0">
      {/* Left Panel: Chat & History */}
      <div className="w-full md:w-1/3 border-r border-zinc-200 dark:border-zinc-800/50 flex flex-col h-[35vh] md:h-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl z-10 shrink-0">
        <div className="flex border-b border-zinc-200 dark:border-zinc-800/50">
          <button onClick={() => setChatMode('chat')} className={`flex-1 py-3 md:py-4 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors ${chatMode === 'chat' ? 'bg-zinc-50 dark:bg-zinc-900/50 border-b-2 border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/30'}`}>Chat</button>
          <button onClick={() => setChatMode('history')} className={`flex-1 py-3 md:py-4 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors ${chatMode === 'history' ? 'bg-zinc-50 dark:bg-zinc-900/50 border-b-2 border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/30'}`}>Histórico</button>
        </div>

        {chatMode === 'chat' ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
              {state.chatHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 text-zinc-400">
                   <div className="p-4 rounded-full bg-zinc-100 dark:bg-zinc-900 mb-4">
                     <Icons.Code className="w-8 h-8 opacity-50" />
                   </div>
                   <p className="text-sm font-semibold text-metallic">Axium Coder IDE</p>
                   <p className="text-xs text-zinc-500 mt-2 font-light">Turbinado com TailwindCSS & FontAwesome.</p>
                </div>
              )}
              {state.chatHistory.map(msg => (
                <div key={msg.id} className={`text-sm p-3 rounded-xl shadow-sm border ${msg.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 ml-6 text-right' : 'bg-white dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300 mr-6 border-zinc-100 dark:border-zinc-700/50'}`}>
                  {msg.content}
                </div>
              ))}
              {loading && <div className="ml-4"><LoadingSpinner /></div>}
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-950/50 backdrop-blur">
              <div className="flex gap-2">
                <input 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && !loading && handleCodeUpdate()}
                  placeholder="Ex: Crie uma landing page..."
                  className="flex-1 bg-zinc-100/50 dark:bg-zinc-900/50 rounded-lg px-4 py-3 text-sm focus:outline-none border border-zinc-200 dark:border-zinc-800 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors"
                />
                <button onClick={handleCodeUpdate} disabled={loading} className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 p-3 rounded-lg hover:opacity-90 shadow-lg">
                  <Icons.Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {state.history.length === 0 && <p className="text-center text-zinc-500 text-sm mt-10 font-light">Nenhuma versão salva.</p>}
             {state.history.map((ver, i) => (
               <div key={i} className="flex justify-between items-center p-4 bg-white/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors group backdrop-blur-sm">
                 <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{ver.title}</span>
                    <div className="text-xs text-zinc-500 mt-1">{ver.created_at ? new Date(ver.created_at).toLocaleTimeString() : 'N/A'}</div>
                 </div>
                 <button onClick={() => loadVersion(ver)} className="text-xs bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium">Restaurar</button>
               </div>
             ))}
          </div>
        )}
      </div>

      {/* Right Panel: Preview & Code */}
      <div className="w-full md:w-2/3 flex flex-col h-[65vh] md:h-full bg-zinc-100 dark:bg-[#0c0c0e] relative backdrop-blur-sm">
        {/* IDE Toolbar */}
        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center px-4 bg-white/80 dark:bg-zinc-950 backdrop-blur-md z-20 overflow-x-auto no-scrollbar gap-2">
          <div className="flex gap-1 bg-zinc-100/50 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200/50 dark:border-zinc-800 shrink-0">
            <button onClick={() => setActiveTab('preview')} className={`px-3 sm:px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'preview' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Visualizar</button>
            <button onClick={() => setActiveTab('code')} className={`px-3 sm:px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'code' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Código</button>
            <button onClick={() => setActiveTab('console')} className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'console' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                Console 
                {state.logs.length > 0 && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
            </button>
          </div>
          
          {activeTab === 'preview' && (
             <div className="hidden sm:flex items-center gap-1 bg-zinc-100/50 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200/50 dark:border-zinc-800 shrink-0">
                <button onClick={() => setPreviewDevice('desktop')} title="Desktop View" className={`p-1.5 rounded-md ${previewDevice === 'desktop' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}><Icons.Desktop className="w-4 h-4" /></button>
                <button onClick={() => setPreviewDevice('tablet')} title="Tablet View" className={`p-1.5 rounded-md ${previewDevice === 'tablet' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}><Icons.Tablet className="w-4 h-4" /></button>
                <button onClick={() => setPreviewDevice('mobile')} title="Mobile View" className={`p-1.5 rounded-md ${previewDevice === 'mobile' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500'}`}><Icons.Mobile className="w-4 h-4" /></button>
             </div>
          )}

          <div className="flex gap-2 shrink-0">
            <button onClick={saveVersion} title="Salvar Versão" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"><Icons.Save className="w-4 h-4" /></button>
            <button onClick={downloadSite} title="Baixar HTML" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"><Icons.Download className="w-4 h-4" /></button>
            <button onClick={openFullScreen} title="Tela Cheia" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"><Icons.Maximize className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden bg-zinc-200 dark:bg-[#121214] flex justify-center items-start pt-4 pb-4">
          {activeTab === 'preview' ? (
             <motion.div 
               animate={{ width: getPreviewWidth() }}
               transition={{ type: "spring", stiffness: 300, damping: 30 }}
               className="h-full bg-white shadow-2xl overflow-hidden relative"
               style={{ 
                   borderRadius: previewDevice === 'desktop' ? '0px' : '20px',
                   border: previewDevice === 'desktop' ? 'none' : '8px solid #27272a'
               }}
             >
                 <iframe 
                   key={iframeKey}
                   srcDoc={fullDoc}
                   title="preview"
                   className="w-full h-full bg-white"
                   sandbox="allow-scripts allow-modals allow-same-origin"
                 />
             </motion.div>
          ) : activeTab === 'code' ? (
            <div className="flex h-full w-full bg-white dark:bg-[#0c0c0e]">
               {/* File Explorer Sidebar */}
               <div className="w-12 md:w-48 bg-zinc-50 dark:bg-[#18181b] border-r border-zinc-200 dark:border-zinc-800 flex flex-col pt-2 transition-all">
                  <div className="hidden md:block px-4 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Explorer</div>
                  <div className="hidden md:flex items-center gap-1 px-3 py-1 text-xs font-bold text-zinc-600 dark:text-zinc-300 mt-2">
                      <Icons.ChevronDown className="w-3 h-3" />
                      <span className="uppercase">Project</span>
                  </div>
                  <div className="flex flex-col md:ml-2 border-l-0 md:border-l border-zinc-200 dark:border-zinc-700/50">
                     <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                         <Icons.Folder className="w-3.5 h-3.5 text-yellow-500/70" />
                         src
                     </div>
                     <div className="flex flex-col items-center md:items-stretch">
                        <FileItem name={<span className="hidden md:inline">index.html</span>} type="html" active={codeTab === 'html'} onClick={() => setCodeTab('html')} />
                        <FileItem name={<span className="hidden md:inline">style.css</span>} type="css" active={codeTab === 'css'} onClick={() => setCodeTab('css')} />
                        <FileItem name={<span className="hidden md:inline">script.js</span>} type="js" active={codeTab === 'js'} onClick={() => setCodeTab('js')} />
                     </div>
                  </div>
               </div>

               {/* Editor Area */}
               <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#0c0c0e]">
                   <div className="h-9 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 bg-zinc-50/50 dark:bg-[#121214]">
                       <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                          src / <span className="text-zinc-900 dark:text-zinc-200 font-bold">{codeTab === 'html' ? 'index.html' : codeTab === 'css' ? 'style.css' : 'script.js'}</span>
                       </span>
                   </div>
                   <textarea 
                     value={state[codeTab]}
                     onChange={(e) => setState(prev => ({ ...prev, [codeTab]: e.target.value }))}
                     className="flex-1 w-full bg-white dark:bg-[#0c0c0e] text-zinc-800 dark:text-[#a1a1aa] font-mono text-sm p-4 md:p-6 resize-none outline-none leading-relaxed custom-scrollbar"
                     spellCheck={false}
                     style={{ fontFamily: '"Fira Code", "Consolas", monospace' }}
                   />
               </div>
            </div>
          ) : (
              <div className="w-full h-full bg-[#0c0c0e] p-4 overflow-y-auto font-mono text-xs">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-800">
                      <Icons.Terminal className="w-4 h-4 text-zinc-500" />
                      <span className="text-zinc-400 font-bold uppercase tracking-wider">Console Output</span>
                      <button onClick={() => setState(p => ({...p, logs: []}))} className="ml-auto text-zinc-600 hover:text-zinc-400">Limpar</button>
                  </div>
                  {state.logs.length === 0 && <div className="text-zinc-600 italic">Sem logs registrados.</div>}
                  {state.logs.map((log, i) => (
                      <div key={i} className={`mb-2 font-mono break-all ${
                          log.type === 'error' ? 'text-red-400' : 
                          log.type === 'warn' ? 'text-yellow-400' : 
                          'text-zinc-300'
                      }`}>
                          <span className="text-zinc-600 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          {log.message}
                      </div>
                  ))}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SocialDesignTool = ({ profile, onConsume, onLimitReached, savedState, saveState }: ToolProps) => {
    const [topic, setTopic] = useState(savedState?.topic || "");
    const [result, setResult] = useState<any>(savedState?.result || null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        saveState?.({ topic, result });
    }, [topic, result, saveState]);

    const handleGenerate = async () => {
        if(!topic) return;

        if (profile && profile.plan === 'free' && profile.credits <= 0) {
            onLimitReached?.();
            return;
        }

        setLoading(true);
        try {
            const data = await Gemini.generateSocialPost(topic);
            setResult(data);
            onConsume?.();
        } catch(e: any) {
            alert("Erro ao gerar post. " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center h-full px-4 pt-12 pb-24 overflow-y-auto max-w-4xl mx-auto relative z-10">
            <div className="text-center mb-10">
                <h2 className="text-3xl font-bold mb-2 text-metallic">Social Media AI</h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-light">Crie posts virais com legendas, hashtags e direção de arte.</p>
            </div>

            <div className="w-full max-w-2xl mb-10">
                <InputArea value={topic} onChange={setTopic} onSubmit={handleGenerate} loading={loading} placeholder="Sobre o que é o post?" buttonLabel="Gerar Estratégia" />
            </div>

            {loading && (
                 <div className="flex flex-col items-center mt-10">
                     <LoadingSpinner />
                     <p className="text-xs text-zinc-500 mt-2 uppercase tracking-widest">Analisando tendências...</p>
                 </div>
            )}

            {result && !loading && (
                <motion.div 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="w-full grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                    {/* Caption Card */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 text-zinc-400 uppercase text-xs font-bold tracking-wider">
                            <Icons.Edit className="w-4 h-4" /> Legenda
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{result.caption}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {result.hashtags?.map((h: string, i: number) => (
                                <span key={i} className="text-blue-500 text-xs font-medium">{h}</span>
                            ))}
                        </div>
                    </div>

                    {/* Art Direction Card */}
                    <div className="flex flex-col gap-6">
                        <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-6">
                            <div className="flex items-center gap-2 mb-4 text-purple-500 uppercase text-xs font-bold tracking-wider">
                                <Icons.Image className="w-4 h-4" /> Prompt de Imagem
                            </div>
                            <p className="text-xs font-mono text-zinc-600 dark:text-zinc-300 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-purple-500/10">
                                {result.imagePrompt}
                            </p>
                        </div>

                        <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                            <div className="flex items-center gap-2 mb-4 text-zinc-400 uppercase text-xs font-bold tracking-wider">
                                <Icons.Layers className="w-4 h-4" /> Direção de Arte
                            </div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 italic">
                                "{result.artDirection}"
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
};

// Generic Tool for Text Generation (restoring missing features)
const SimpleGenTool = ({ type, profile, onConsume, onLimitReached }: { type: ToolType } & Partial<ToolProps>) => {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  // Configuration map for different tools
  const getConfig = () => {
    switch(type) {
        case ToolType.CopyGen: 
            return { 
                title: "Gerador de Copy", 
                desc: "Persuasão estratégica. Crie textos de vendas, anúncios e emails de alta conversão.",
                placeholder: "Descreva o produto, público-alvo e objetivo...", 
                instruction: "Você é um copywriter expert de resposta direta. Crie um texto persuasivo usando gatilhos mentais." 
            };
        case ToolType.PromptGen: 
            return { 
                title: "Otimizador de Prompt", 
                desc: "Refine sua visão. Otimize instruções simples para obter resultados profissionais.",
                placeholder: "Digite sua ideia básica de prompt...", 
                instruction: "Você é um especialista em Engenharia de Prompt para LLMs. Reescreva o prompt do usuário para ser altamente detalhado, estruturado e eficaz." 
            };
        case ToolType.TextImprover: 
            return { 
                title: "Melhorar Texto", 
                desc: "Eleve sua escrita. Aprimore gramática, tom e clareza.",
                placeholder: "Cole seu texto aqui...", 
                instruction: "Você é um editor profissional. Melhore a gramática, coesão, clareza e elegância do texto fornecido, mantendo a mensagem original." 
            };
        case ToolType.DesignGen: 
            return { 
                title: "Gerador de UI", 
                desc: "Arquitetura de interface. Gere estruturas JSON para componentes.",
                placeholder: "Descreva o componente (ex: Card de Produto)...", 
                instruction: "Gere uma estrutura JSON representando os dados e estados necessários para este componente de UI." 
            };
        case ToolType.VideoStructure: 
            return { 
                title: "Estrutura de Vídeo", 
                desc: "Planejamento de conteúdo. Roteiros e metadados estruturados.",
                placeholder: "Sobre o que é o vídeo?", 
                instruction: "Gere um plano de vídeo estruturado com Título (SEO), Descrição, Tags e Estrutura de Tópicos." 
            };
        case ToolType.Hashtags:
            return {
                title: "Gerador de Hashtags",
                desc: "Aumente seu alcance. Gere tags virais para seu nicho.",
                placeholder: "Qual o tema do post?",
                instruction: "Gere 30 hashtags virais e otimizadas para o tema fornecido. Separe por relevância."
            };
        case ToolType.VideoIdeas:
            return {
                title: "Ideias de Vídeo",
                desc: "Bloqueio criativo? Nunca mais. Gere ganchos virais.",
                placeholder: "Qual o seu nicho?",
                instruction: "Gere 3 ideias de vídeo únicas com Título, Gancho (Hook) e Breve Roteiro."
            };
        default: 
            return { title: "Gerador", desc: "", placeholder: "Digite aqui...", instruction: "" };
    }
  }
  const config = getConfig();

  const handleSend = async () => {
     if (!input.trim()) return;

     if (profile && profile.plan === 'free' && profile.credits <= 0) {
        onLimitReached?.();
        return;
     }

     setLoading(true);
     try {
         const text = await Gemini.generateText(input, config.instruction);
         setOutput(text || "Sem resposta");
         onConsume?.();
     } catch(e) {
         setOutput("Erro ao gerar conteúdo.");
     } finally {
         setLoading(false);
     }
  }

  return (
    <div className="flex flex-col items-center h-full px-4 pt-12 pb-28 overflow-y-auto max-w-4xl mx-auto relative z-10">
        <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2 text-metallic">{config.title}</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-light max-w-md mx-auto">{config.desc}</p>
        </div>

        <div className="w-full max-w-3xl mb-8">
            <InputArea value={input} onChange={setInput} onSubmit={handleSend} loading={loading} placeholder={config.placeholder} buttonLabel="Gerar" />
        </div>

        {output && (
            <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="w-full max-w-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-lg"
            >
                <div className="flex justify-between items-center mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Resultado</span>
                    <button onClick={() => navigator.clipboard.writeText(output)} className="text-xs text-blue-500 hover:text-blue-400 font-medium">Copiar</button>
                </div>
                <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono">
                    {output}
                </div>
            </motion.div>
        )}
    </div>
  );
}

const App = () => {
  const [authStage, setAuthStage] = useState<'landing' | 'login' | 'app'>('landing');
  const [session, setSession] = useState<any>(null); // Supabase session
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.Chat);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // --- STATE PERSISTENCE ---
  const [imageState, setImageState] = useState<ImageGenState | undefined>();
  const [coderState, setCoderState] = useState<CoderState | undefined>();
  const [socialState, setSocialState] = useState<SocialGenState | undefined>();
  const [audioState, setAudioState] = useState<AudioGenState | undefined>();

  const fetchProfile = async () => {
      try {
          const profile = await Supabase.getUserProfile();
          setUserProfile(profile);
      } catch (e) {
          console.error("Error fetching profile", e);
      }
  };

  useEffect(() => {
     // Check session
     Supabase.getSession().then(s => {
         if (s) {
             setSession(s);
             setAuthStage('app');
             fetchProfile();
         }
     });
     
     // Theme init
     if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
         setTheme('light');
     }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  
  const handleSignOut = async () => {
      await Supabase.signOut();
      setSession(null);
      setUserProfile(null);
      setAuthStage('landing');
      // Clear states
      setImageState(undefined);
      setCoderState(undefined);
      setSocialState(undefined);
      setAudioState(undefined);
  };

  const handleConsumeCredit = async () => {
      try {
          await Supabase.consumeCredit();
          // Update local state immediately for responsiveness
          if (userProfile && userProfile.plan === 'free') {
              setUserProfile({ ...userProfile, credits: Math.max(0, userProfile.credits - 1) });
          }
      } catch (e) {
          console.error("Error consuming credit", e);
      }
  };

  const handleLimitReached = () => {
      setShowUpgrade(true);
  }

  const commonProps = {
      profile: userProfile,
      onConsume: handleConsumeCredit,
      onLimitReached: handleLimitReached,
      setActiveTool: setActiveTool,
      onAuthError: handleSignOut
  };

  const renderTool = () => {
      switch(activeTool) {
          case ToolType.Chat: 
              return <ChatTool {...commonProps} />;
          case ToolType.ImageGen: 
              return <ImageTool {...commonProps} savedState={imageState} saveState={setImageState} />;
          case ToolType.AudioGen: 
              return <AudioTool {...commonProps} savedState={audioState} saveState={setAudioState} />;
          case ToolType.Coder: 
              return <CoderTool {...commonProps} savedState={coderState} saveState={setCoderState} />;
          case ToolType.SocialPostGen: 
              return <SocialDesignTool {...commonProps} savedState={socialState} saveState={setSocialState} />;
          // Generic Tools (Simplest form, state not persisted deeply as they are usually one-off)
          case ToolType.CopyGen:
          case ToolType.PromptGen:
          case ToolType.TextImprover:
          case ToolType.DesignGen:
          case ToolType.VideoStructure:
          case ToolType.Hashtags:
          case ToolType.VideoIdeas:
              return <SimpleGenTool type={activeTool} {...commonProps} />;
          default: return <ChatTool {...commonProps} />;
      }
  }

  if (authStage === 'landing') return <LandingPage onStart={() => setAuthStage('login')} />;
  if (authStage === 'login') return <LoginPage onLogin={() => { setAuthStage('app'); Supabase.getSession().then((s) => { setSession(s); fetchProfile(); }); }} />;

  // Loading state while session is being verified
  if (authStage === 'app' && !session) return (
      <div className="h-screen w-full flex items-center justify-center bg-zinc-950">
          <LoadingSpinner />
      </div>
  );

  return (
    <div className="h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans transition-colors duration-500 relative">
       <BackgroundGradient />
       
       <UpgradeModal 
            isOpen={showUpgrade} 
            onClose={() => setShowUpgrade(false)}
            onCheckPayment={fetchProfile}
        />

       {/* Main Content Area */}
       <main className="h-full w-full">
          <AnimatePresence mode="wait">
             <motion.div 
               key={activeTool}
               initial={{ opacity: 0, scale: 0.99, filter: "blur(5px)" }}
               animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
               exit={{ opacity: 0, scale: 1.01, filter: "blur(5px)" }}
               transition={{ duration: 0.3, ease: "easeOut" }}
               className="h-full w-full"
             >
                {renderTool()}
             </motion.div>
          </AnimatePresence>
       </main>

       {/* Floating Bottom Navigation */}
       <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 max-w-[95vw]">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white/80 dark:bg-zinc-950/70 backdrop-blur-xl border border-white/20 dark:border-zinc-800 rounded-full shadow-2xl ring-1 ring-white/50 dark:ring-zinc-700/50 overflow-x-auto no-scrollbar">
            {/* Sign Out Button (Left) */}
            <button 
                 onClick={handleSignOut} 
                 className="flex items-center justify-center p-3 rounded-full transition-all duration-300 bg-transparent text-zinc-500 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 hover:text-red-500 shrink-0"
                 title="Sair"
            >
                 <Icons.LogOut className="w-5 h-5" />
            </button>
            <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-800 mx-2 shrink-0"></div>

            <NavButton active={activeTool === ToolType.Chat} onClick={() => setActiveTool(ToolType.Chat)} icon={Icons.Chat} label="Chat" />
            <NavButton active={activeTool === ToolType.Coder} onClick={() => setActiveTool(ToolType.Coder)} icon={Icons.Code} label="Code" />
            <NavButton active={activeTool === ToolType.ImageGen} onClick={() => setActiveTool(ToolType.ImageGen)} icon={Icons.Image} label="Image" />
            <NavButton active={activeTool === ToolType.AudioGen} onClick={() => setActiveTool(ToolType.AudioGen)} icon={Icons.Audio} label="Voice" />
            
            <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-800 mx-2 shrink-0"></div>
            
            <NavButton active={activeTool === ToolType.SocialPostGen} onClick={() => setActiveTool(ToolType.SocialPostGen)} icon={Icons.Layers} label="Social" />
            <NavButton active={activeTool === ToolType.Hashtags} onClick={() => setActiveTool(ToolType.Hashtags)} icon={Icons.Hash} label="Tags" />
            <NavButton active={activeTool === ToolType.VideoIdeas} onClick={() => setActiveTool(ToolType.VideoIdeas)} icon={Icons.Bulb} label="Ideas" />
            <NavButton active={activeTool === ToolType.VideoStructure} onClick={() => setActiveTool(ToolType.VideoStructure)} icon={Icons.Video} label="Script" />
            
            <NavButton active={activeTool === ToolType.PromptGen} onClick={() => setActiveTool(ToolType.PromptGen)} icon={Icons.Sparkles} label="Prompt" />
            <NavButton active={activeTool === ToolType.CopyGen} onClick={() => setActiveTool(ToolType.CopyGen)} icon={Icons.Feather} label="Copy" />
            <NavButton active={activeTool === ToolType.TextImprover} onClick={() => setActiveTool(ToolType.TextImprover)} icon={Icons.Edit} label="Editor" />
            <NavButton active={activeTool === ToolType.DesignGen} onClick={() => setActiveTool(ToolType.DesignGen)} icon={Icons.Layout} label="UI Gen" />
            
            {/* Divider */}
            <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-800 mx-2 shrink-0"></div>
            
            {/* Credit Counter */}
            <div 
               className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase border transition-colors cursor-pointer ${
                   userProfile?.plan === 'pro' 
                     ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' 
                     : userProfile && userProfile.credits <= 0 
                       ? 'bg-red-500/10 text-red-500 border-red-500/20'
                       : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
               }`}
               onClick={() => setShowUpgrade(true)}
            >
                {userProfile?.plan === 'pro' ? (
                    <>⚡ Pro</>
                ) : (
                    <>💎 {userProfile?.credits ?? '...'} <span className="hidden sm:inline">Créditos</span></>
                )}
            </div>

            <button 
                onClick={toggleTheme} 
                className="flex items-center justify-center p-3 rounded-full transition-all duration-300 bg-transparent text-zinc-500 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200 shrink-0"
                title={theme === 'dark' ? "Modo Claro" : "Modo Escuro"}
            >
                {theme === 'dark' ? <Icons.Sun className="w-5 h-5" /> : <Icons.Moon className="w-5 h-5" />}
            </button>
        </div>
       </div>
    </div>
  );
};

export default App;
