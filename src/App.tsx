import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Flag, RefreshCw, Hand, X } from 'lucide-react';

const DEPARTMENTS = [
  { name: 'digital print', color: '#3B82F6' },
  { name: 'publication', color: '#EC4899' }
];

type PopupType = 'number' | 'blank' | 'mine' | 'ghost' | 'summary' | 'flag';

interface PopupData {
  id: string;
  type: PopupType;
  title: string;
  body: string;
  footer?: string;
  x: number;
  y: number;
  zIndex: number;
  color?: string;
  fontSize?: string;
  blur?: string;
  stamp?: string;
}

type TileData = {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  justFlagged: boolean;
  justRevealed: boolean;
  neighborMines: number;
  ghostDept: typeof DEPARTMENTS[0] | null;
  ghostStrength: number;
  glowGreen: boolean;
  inkSpread: boolean;
};

type LogEvent = {
  id: string;
  timestamp: string;
  title: string;
  body: string;
  isUnseenSummary?: boolean;
};

type RunState = {
  NUM_1: boolean;
  NUM_2: boolean;
  NUM_3: boolean;
  NUM_4: boolean;
  MINE_TRIGGERED: boolean;
  FLAG_PLACED: boolean;
  GHOST_FLAG_CLICKED: boolean;
};

const ROWS = 10;
const COLS = 10;
const MINES = 13;

const DraggablePopup: React.FC<{ data: PopupData, bringToFront: (id: string) => void }> = ({ data, bringToFront }) => {
  const [pos, setPos] = useState({ x: data.x, y: data.y });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    bringToFront(data.id);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  let containerStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    zIndex: data.zIndex,
    opacity: data.type === 'blank' ? 0.7 : 0.9,
    filter: data.blur ? `blur(${data.blur})` : 'none',
    borderColor: data.color || '#5A3E1B',
  };

  let titleStyle: React.CSSProperties = {
    backgroundColor: data.color || '#5A3E1B',
    color: '#fff',
  };

  let bodyStyle: React.CSSProperties = {
    fontSize: data.fontSize || '12px',
    lineHeight: '1.2',
  };

  return (
    <div 
      className={`fixed w-52 bg-[#FFF9E6] border-2 flex flex-col ${data.type === 'mine' ? 'border-[#5A3E1B]' : ''}`}
      style={containerStyle}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="px-2 py-1 cursor-grab font-bold text-[10px] tracking-wider flex justify-between items-center select-none"
        style={titleStyle}
      >
        <span>{data.title}</span>
      </div>
      <div className="p-2 text-[#5A3E1B] whitespace-pre-line relative overflow-hidden" style={bodyStyle}>
        {data.stamp && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-[#5A3E1B]/15 animate-soft-fade pixel-font">
              {data.stamp}
            </span>
          </div>
        )}
        <span className="relative z-10 font-mono">{data.body}</span>
        {data.footer && (
          <div className="mt-1 text-[10px] text-[#5A3E1B]/60 border-t border-[#5A3E1B]/20 pt-1 relative z-10 font-mono">
            {data.footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [grid, setGrid] = useState<TileData[][]>([]);
  const [popups, setPopups] = useState<PopupData[]>([]);
  const [zIndexCounter, setZIndexCounter] = useState(10);
  const [time, setTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [hasPlacedFlag, setHasPlacedFlag] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const [networkLog, setNetworkLog] = useState<LogEvent[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [runState, setRunState] = useState<RunState>({
    NUM_1: false,
    NUM_2: false,
    NUM_3: false,
    NUM_4: false,
    MINE_TRIGGERED: false,
    FLAG_PLACED: false,
    GHOST_FLAG_CLICKED: false
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive) {
      interval = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  useEffect(() => {
    if (!hasPlacedFlag || isCompleted) return;
    
    const interval = setInterval(() => {
      setGrid(g => {
        const newGrid = [...g.map(row => [...row])];
        const validTiles = [];
        let ghostCount = 0;
        let dpCount = 0;
        let pubCount = 0;
        
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (newGrid[r][c].ghostDept) {
              ghostCount++;
              if (newGrid[r][c].ghostDept?.name === 'digital print') dpCount++;
              if (newGrid[r][c].ghostDept?.name === 'publication') pubCount++;
            }
            if (!newGrid[r][c].isMine && !newGrid[r][c].ghostDept && !newGrid[r][c].isFlagged && !newGrid[r][c].isRevealed) {
              validTiles.push({ r, c });
            }
          }
        }

        if (validTiles.length > 0 && ghostCount < 2) {
          const availableDepts = [];
          if (dpCount < 1) availableDepts.push(DEPARTMENTS[0]);
          if (pubCount < 1) availableDepts.push(DEPARTMENTS[1]);

          if (availableDepts.length > 0) {
            const { r, c } = validTiles[Math.floor(Math.random() * validTiles.length)];
            newGrid[r][c].ghostDept = availableDepts[Math.floor(Math.random() * availableDepts.length)];
            newGrid[r][c].ghostStrength = Math.random() > 0.5 ? 0.9 : 0.5;
          }
        }
        return newGrid;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [hasPlacedFlag, isCompleted, runState.MINE_TRIGGERED]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [networkLog]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 200);
  };

  const bringToFront = (id: string) => {
    setZIndexCounter(z => z + 1);
    setPopups(prev => prev.map(p => p.id === id ? { ...p, zIndex: zIndexCounter + 1 } : p));
  };

  const logEvent = useCallback((typeKey: string, title: string, body: string) => {
    setNetworkLog(prevLogs => {
      if (!prevLogs.some(log => log.id === typeKey)) {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let logTitle = title;
        let logBody = body.split('\n')[0]; // Take first line for terminal brevity
        
        if (typeKey.startsWith('num-')) {
          logTitle = `[DENSITY ${typeKey.split('-')[1]}]`;
        } else if (typeKey === 'ghost') {
          logTitle = `[INTERFERENCE]`;
        } else if (typeKey === 'mine') {
          logTitle = `[PRACTICE LOSS]`;
          logBody = 'Trial prints accumulated.';
        } else if (typeKey === 'flag') {
          logTitle = `[HELD]`;
          logBody = 'Reuse intent recorded.';
        } else if (typeKey === 'blank') {
          logTitle = `[FLOW STATE]`;
          logBody = 'Smooth workflow.';
        }

        return [...prevLogs, { id: typeKey, timestamp, title: logTitle, body: logBody }];
      }
      return prevLogs;
    });
  }, []);

  const addPopup = useCallback((type: PopupType, extra?: any) => {
    const id = Math.random().toString(36).substr(2, 9);
    const x = Math.max(280, Math.floor(Math.random() * (window.innerWidth - 260)));
    const y = Math.max(20, Math.floor(Math.random() * (window.innerHeight - 200)));
    
    setZIndexCounter(z => z + 1);
    const zIndex = zIndexCounter + 1;

    let popup: PopupData = { id, type, title: '', body: '', x, y, zIndex };

    if (type === 'number') {
      const num = extra.num;
      popup.title = `PRACTICE DENSITY: ${num}`;
      if (num === 1) {
        popup.body = 'Low friction nearby.\nSingle proof likely.\nAwareness lives in practice, not signage.';
        popup.fontSize = '16px';
        popup.blur = '0px';
        setRunState(s => ({ ...s, NUM_1: true }));
      } else if (num === 2) {
        popup.body = 'Repeated testing zone.\nPaper reuse active.\nAwareness lives in practice, not signage.';
        popup.fontSize = '14px';
        popup.blur = '0.5px';
        setRunState(s => ({ ...s, NUM_2: true }));
      } else if (num === 3) {
        popup.body = 'High trial frequency.\nWaste risk rising.\nAwareness lives in practice, not signage.';
        popup.fontSize = '12px';
        popup.blur = '1px';
        setRunState(s => ({ ...s, NUM_3: true }));
      } else if (num === 4) {
        popup.body = 'Practice saturation.\nMisprint probability high.\nAwareness lives in practice, not signage.';
        popup.fontSize = '11px';
        popup.blur = '1.5px';
        setRunState(s => ({ ...s, NUM_4: true }));
      } else {
        popup.body = 'Dense friction cluster.\nMaterial loss likely.\nAwareness lives in practice, not signage.';
        popup.fontSize = '10px';
        popup.blur = '2px';
        setRunState(s => ({ ...s, NUM_4: true }));
      }
      
      logEvent(`num-${num}`, popup.title, popup.body);
    } else if (type === 'blank') {
      popup.title = 'FLOW STATE';
      popup.body = 'Smooth workflow.\nReuse loop feels effortless.';
      logEvent('blank', popup.title, popup.body);
    } else if (type === 'mine') {
      popup.title = 'PRACTICE LOSS';
      popup.body = 'Trial print failed.\nMaterial intensity high.\nSource unverified.\nReuse loop strained.';
      popup.color = '#5A3E1B';
      setRunState(s => ({ ...s, MINE_TRIGGERED: true }));
      logEvent('mine', popup.title, popup.body);
    } else if (type === 'ghost') {
      const dept = extra.dept;
      popup.title = dept.name === 'digital print' ? 'DIGITAL CHECK' : 'PUBLICATION REQUEST';
      popup.color = dept.color;
      if (dept.name === 'digital print') {
        popup.body = `Paper compatibility questioned.\n'Not suited for printers.'`;
      } else if (dept.name === 'publication') {
        popup.body = `Can we take small boards/offcuts?\nManual redistribution.`;
      }
      setRunState(s => ({ ...s, GHOST_FLAG_CLICKED: true }));
      logEvent('ghost', popup.title, popup.body);
    } else if (type === 'flag') {
      popup.title = 'HELD FOR REUSE';
      popup.body = 'Marked as \'do not discard\'.\nReuse intent recorded.';
      setRunState(s => ({ ...s, FLAG_PLACED: true }));
      logEvent('flag', popup.title, popup.body);
    }

    setPopups(prev => [...prev, popup]);
  }, [zIndexCounter, logEvent]);

  const initializeGrid = useCallback(() => {
    let newGrid: TileData[][] = Array(ROWS).fill(null).map((_, r) =>
      Array(COLS).fill(null).map((_, c) => ({
        row: r,
        col: c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        justFlagged: false,
        justRevealed: false,
        neighborMines: 0,
        ghostDept: null,
        ghostStrength: 1,
        glowGreen: false,
        inkSpread: false,
      }))
    );

    let minesPlaced = 0;
    while (minesPlaced < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c].isMine = true;
        minesPlaced++;
      }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!newGrid[r][c].isMine) {
          let count = 0;
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              if (r + i >= 0 && r + i < ROWS && c + j >= 0 && c + j < COLS) {
                if (newGrid[r + i][c + j].isMine) count++;
              }
            }
          }
          newGrid[r][c].neighborMines = count;
        }
      }
    }

    setGrid(newGrid);
    setPopups([]);
    setIsCompleted(false);
    setShowCompletionModal(false);
    setShowCompletionBanner(false);
    setTime(0);
    setTimerActive(false);
    setHasPlacedFlag(false);
    setClickCount(0);
    setNetworkLog([]);
    setRunState({
      NUM_1: false,
      NUM_2: false,
      NUM_3: false,
      NUM_4: false,
      MINE_TRIGGERED: false,
      FLAG_PLACED: false,
      GHOST_FLAG_CLICKED: false
    });
  }, []);

  useEffect(() => {
    initializeGrid();
  }, [initializeGrid]);

  const checkCompletion = (currentGrid: TileData[][]) => {
    let allRevealed = true;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!currentGrid[r][c].isRevealed) {
          allRevealed = false;
          break;
        }
      }
    }
    if (allRevealed && !isCompleted) {
      setIsCompleted(true);
      setTimerActive(false);
      setShowCompletionModal(true);
    }
  };

  const handleModalClose = () => {
    setShowCompletionModal(false);
    setShowCompletionBanner(true);

    const unseenKeys = Object.entries(runState)
      .filter(([_, seen]) => !seen)
      .map(([key]) => key);

    let summaryBody = '';
    if (unseenKeys.length === 0) {
      summaryBody = '> ALL TYPES DISCOVERED ✓';
    } else {
      summaryBody = unseenKeys.map(key => `> ${key} [UNSEEN]`).join('\n');
    }

    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    setNetworkLog(prev => [
      ...prev,
      {
        id: 'unseen-summary',
        timestamp,
        title: '--- UNSEEN TYPES (REPLAY TO DISCOVER) ---',
        body: summaryBody,
        isUnseenSummary: true
      }
    ]);
  };

  const revealTile = (r: number, c: number) => {
    if (grid[r][c].isFlagged || isCompleted) return;
    if (!timerActive) setTimerActive(true);

    setClickCount(prev => prev + 1);

    const newGrid = [...grid.map(row => [...row])];
    const tile = newGrid[r][c];

    if (tile.ghostDept) {
      addPopup('ghost', { dept: tile.ghostDept, strength: tile.ghostStrength });
    }

    if (tile.isRevealed) return;

    tile.isRevealed = true;
    tile.justRevealed = true;

    if (tile.isMine) {
      tile.inkSpread = true;
      addPopup('mine');
    } else if (tile.neighborMines === 0) {
      tile.glowGreen = true;
      
      if (!tile.ghostDept) addPopup('blank');

      const queue = [[r, c]];
      while (queue.length > 0) {
        const [currR, currC] = queue.shift()!;
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const nr = currR + i;
            const nc = currC + j;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const neighbor = newGrid[nr][nc];
              if (!neighbor.isRevealed && !neighbor.isMine && !neighbor.isFlagged) {
                neighbor.isRevealed = true;
                neighbor.justRevealed = true;
                if (neighbor.neighborMines === 0) {
                  queue.push([nr, nc]);
                }
              }
            }
          }
        }
      }
    } else {
      if (!tile.ghostDept) {
        addPopup('number', { num: tile.neighborMines });
      }
    }

    setGrid(newGrid);
    
    setTimeout(() => {
      setGrid(g => {
        const next = [...g.map(row => [...row])];
        for (let i = 0; i < ROWS; i++) {
          for (let j = 0; j < COLS; j++) {
            if (next[i][j]) {
              next[i][j].justRevealed = false;
              next[i][j].glowGreen = false;
            }
          }
        }
        return next;
      });
    }, 600);

    checkCompletion(newGrid);
  };

  const toggleFlag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (grid[r][c].isRevealed || isCompleted) return;
    if (!timerActive) setTimerActive(true);

    setClickCount(prev => prev + 1);

    const newGrid = [...grid.map(row => [...row])];
    const tile = newGrid[r][c];

    if (!tile.isFlagged) {
      tile.isFlagged = true;
      tile.justFlagged = true;
      setHasPlacedFlag(true);
      addPopup('flag');
      
      setTimeout(() => {
        setGrid(g => {
          const next = [...g.map(row => [...row])];
          if (next[r][c]) next[r][c].justFlagged = false;
          return next;
        });
      }, 1000);
    } else {
      tile.isFlagged = false;
    }

    setGrid(newGrid);
  };

  const getNumberColor = (num: number) => {
    return 'text-[#5A3E1B]';
  };

  const overlayOpacity = Math.min(clickCount * 0.015, 0.6);

  return (
    <div className={`min-h-screen bg-transparent text-slate-800 font-sans flex flex-col lg:flex-row transition-transform ${isShaking ? 'animate-shake' : ''} overflow-hidden relative`}>
      <div 
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
        style={{ backgroundColor: `rgba(0,0,0, ${overlayOpacity})` }}
      />

      {/* Network Log Panel - Left Terminal Style */}
      <div className="w-full lg:w-[260px] bg-[#111] border-r-2 border-[#5A3E1B] flex flex-col h-[300px] lg:h-screen relative z-20 shrink-0 text-[#F4C430] font-mono">
        <div className="p-4 border-b border-slate-800 bg-[#1a1a1a]">
          <h2 className="text-sm font-bold tracking-widest text-[#F4C430]">NETWORK LOG</h2>
          <p className="text-[10px] text-[#F4C430]/70 mt-2 leading-relaxed">Reveal all tiles to reconstruct network dynamics.</p>
        </div>
        <div ref={logContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
          {networkLog.length === 0 && (
            <div className="text-[10px] text-[#F4C430]/50 italic animate-pulse">&gt; Awaiting data stream...</div>
          )}
          {networkLog.map(log => (
            <div key={log.id} className={`text-[11px] leading-tight animate-in fade-in slide-in-from-left-2 duration-300 ${log.isUnseenSummary ? 'mt-4 pt-4 border-t border-[#F4C430]/50' : ''}`}>
              {!log.isUnseenSummary && <span className="text-[#F4C430]/50 mr-2">[{log.timestamp}]</span>}
              <span className={`text-[#F4C430] font-bold ${log.isUnseenSummary ? 'block mb-2' : ''}`}>{log.title}</span>
              <span className={`text-[#F4C430] ${log.isUnseenSummary ? 'block whitespace-pre-line' : 'ml-2'}`}>{log.body}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col relative z-10 h-screen overflow-y-auto">
        {showCompletionBanner && (
          <div className="w-full bg-[#5A3E1B] text-[#F4C430] p-3 text-center border-b-2 border-[#F4C430] animate-in slide-in-from-top-4 z-30 sticky top-0">
            <h3 className="text-sm font-bold tracking-widest mb-1">STUDIO CYCLE EXHAUSTED</h3>
            <p className="text-xs font-mono text-[#F4C430]/80">Internal reuse active. Trial intensity high. Upstream and downstream remain opaque.</p>
            <p className="text-[10px] font-mono text-[#F4C430] mt-1">Awareness lives in practice.</p>
          </div>
        )}

        <div className="flex-1 flex justify-center items-start pt-12 px-4 lg:px-8 pb-12">
          <div className="content max-w-2xl w-full">
            <header className="mb-8 border-b-2 border-[#5A3E1B]/20 pb-4 flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#5A3E1B]">PRINTMAKING NODE</h1>
                <p className="text-sm text-[#5A3E1B]/70 font-mono mt-1">SYSTEM COMPLEXITY INDEX // 2050 RECONSTRUCTION</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-[#5A3E1B] text-[#F4C430] font-mono text-xl px-3 py-1 rounded border-2 border-[#5A3E1B] tracking-widest">
                  {formatTime(time)}
                </div>
                <button 
                  onClick={initializeGrid}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#F4C430]/20 hover:bg-[#F4C430]/40 text-[#5A3E1B] text-sm font-bold rounded transition-colors border border-[#F4C430]/50"
                >
                  <RefreshCw size={16} />
                  RESET
                </button>
              </div>
            </header>

            <div className="frame">
              <div 
                className="grid-layout relative z-10" 
                style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {grid.map((row, r) => row.map((tile, c) => {
                  
                  let content = null;
                  let cellClass = "tile flex items-center justify-center text-lg font-bold select-none transition-all duration-300 relative overflow-hidden ";
                  
                  if (tile.isRevealed) {
                    if (tile.isMine) {
                      cellClass += "bg-[#5A3E1B] text-[#F4C430] ";
                      content = (
                        <>
                          <AlertCircle size={20} className="text-[#F4C430] relative z-10" />
                          {tile.inkSpread && (
                            <div className="absolute w-full h-full bg-[#3E2415] rounded-full animate-ink pointer-events-none z-0" />
                          )}
                        </>
                      );
                    } else if (tile.neighborMines > 0) {
                      cellClass += "bg-[#F4C430]/20 ";
                      if (tile.ghostDept) {
                        content = (
                          <div className="relative w-full h-full flex items-center justify-center">
                            <span className={getNumberColor(tile.neighborMines)}>{tile.neighborMines}</span>
                            <Hand size={16} className="absolute bottom-1 right-1" style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />
                          </div>
                        );
                      } else {
                        content = <span className={getNumberColor(tile.neighborMines)}>{tile.neighborMines}</span>;
                      }
                    } else {
                      cellClass += tile.glowGreen ? "bg-[#F4C430]/40 " : "bg-[#F4C430]/20 ";
                      if (tile.ghostDept) {
                        content = <Hand size={18} style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />;
                      }
                    }
                    
                    if (tile.justRevealed && !tile.isMine) {
                      content = (
                        <>
                          {content}
                          <div className="animate-faint-ring" />
                        </>
                      );
                    }
                  } else {
                    cellClass += "bg-[#FDE68A] hover:bg-[#FCD34D] cursor-pointer ";
                    if (tile.isFlagged) {
                      cellClass += "!bg-[#5A3E1B] ";
                      if (tile.justFlagged) {
                        cellClass += "z-10 ";
                      }
                      content = (
                        <div className="flex flex-col items-center justify-center">
                          <Flag size={16} className="text-[#F4C430]" />
                          <span className="text-[6px] text-[#F4C430] leading-none mt-0.5">HELD</span>
                        </div>
                      );
                    } else if (tile.ghostDept) {
                      content = <Hand size={18} style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />;
                    }
                  }

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={cellClass}
                      onClick={() => revealTile(r, c)}
                      onContextMenu={(e) => toggleFlag(e, r, c)}
                    >
                      {content}
                    </div>
                  );
                }))}
              </div>
            </div>

            <div className="mt-8 text-xs text-[#5A3E1B]/70 font-mono flex justify-between">
              <span>LEFT CLICK: EXPLORE NODE</span>
              <span>RIGHT CLICK: HOLD MATERIAL</span>
            </div>
          </div>
        </div>
      </div>

      {popups.map(popup => (
        <DraggablePopup key={popup.id} data={popup} bringToFront={bringToFront} />
      ))}

      {showCompletionModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="max-w-md w-full p-6 border-2 border-[#5A3E1B] bg-[#FFF9E6] relative">
            <button 
              onClick={handleModalClose}
              className="absolute top-3 right-3 text-[#5A3E1B]/50 hover:text-[#5A3E1B] transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold tracking-widest mb-4 text-[#5A3E1B] border-b-2 border-[#F4C430] pb-2">STUDIO CYCLE EXHAUSTED</h2>
            <p className="font-mono text-sm leading-relaxed mb-6 text-[#5A3E1B]/80">
              Internal reuse active.<br/>
              Trial intensity high.<br/>
              Upstream and downstream remain opaque.<br/>
              Awareness lives in practice.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={initializeGrid}
                className="px-4 py-2 bg-[#F4C430]/20 hover:bg-[#F4C430]/40 text-[#5A3E1B] text-xs font-bold tracking-wider transition-colors border border-[#F4C430]/50"
              >
                RESTART
              </button>
              <button 
                onClick={handleModalClose}
                className="px-4 py-2 bg-[#5A3E1B] hover:bg-[#3E2415] text-[#F4C430] text-xs font-bold tracking-wider transition-colors"
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
