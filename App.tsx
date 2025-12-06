import React, { useState, useEffect, useCallback } from 'react';
import { Play, Wallet, Database, Zap, Cpu, ShieldCheck, Terminal, Rocket, CheckCircle2, AlertOctagon, Download, FileText, Plus, Send, ThumbsUp, ArrowRight } from 'lucide-react';
import LogConsole from './components/LogConsole';
import { LogEntry, LogType, WalletAccount } from './types';
import { createWallets, createWalletsFromKeys, fundWallets, executeInteraction, isValidPrivateKey } from './services/celoService';
import { generateInteractionData, analyzeContractStrategy } from './services/geminiService';

const App: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [wallets, setWallets] = useState<WalletAccount[]>([]);
  const [stats, setStats] = useState({ totalTx: 0, successfulTx: 0, failedTx: 0 });
  
  // Form State
  const [targetContract, setTargetContract] = useState('');
  const [walletMode, setWalletMode] = useState<'generate' | 'import'>('generate');
  const [walletCount, setWalletCount] = useState(5);
  const [importText, setImportText] = useState('');
  const [interactionsPerWallet, setInteractionsPerWallet] = useState(10);
  const [funderKey, setFunderKey] = useState('');
  const [customData, setCustomData] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiStrategy, setAiStrategy] = useState('');

  // Initial greeting
  useEffect(() => {
    if (logs.length === 0) {
        addLog("System Ready. Waiting for Celo Mainnet command.", LogType.INFO);
    }
  }, []);

  // Update wallet count when importing
  useEffect(() => {
    if (walletMode === 'import') {
        const lines = importText.split('\n').filter(line => line.trim().length > 0);
        setWalletCount(lines.length);
    }
  }, [importText, walletMode]);

  const addLog = useCallback((message: string, type: LogType, txHash?: string) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      message,
      type,
      txHash
    };
    setLogs(prev => [...prev, entry]);
  }, [logs.length]);

  const handleAiGeneration = async (promptOverride?: string) => {
    if (!targetContract) {
      addLog("Please enter a target contract address first.", LogType.WARNING);
      return;
    }

    const promptToUse = promptOverride || aiPrompt;
    if (!promptToUse) {
        addLog("Please select an action or enter a custom intent.", LogType.WARNING);
        return;
    }

    if (promptOverride) {
        setAiPrompt(promptOverride);
    }

    setIsGeneratingAi(true);
    try {
      addLog(`Gemini Processing: "${promptToUse}"`, LogType.INFO);
      const result = await generateInteractionData(targetContract, promptToUse);
      setCustomData(result.hexData);
      addLog(`Payload Generated: ${result.reasoning}`, LogType.SUCCESS);
      
      const strategy = await analyzeContractStrategy(targetContract);
      setAiStrategy(strategy);
    } catch (e) {
      addLog("Failed to generate AI data.", LogType.ERROR);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleDownloadWallets = () => {
    if (wallets.length === 0) {
        addLog("No wallets to download.", LogType.WARNING);
        return;
    }

    const csvContent = "data:text/csv;charset=utf-8," 
        + "Index,Address,PrivateKey,Status,TxCount\n"
        + wallets.map((w, i) => `${i+1},${w.address},${w.privateKey},${w.status},${w.txCount}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `celoship_wallets_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog("Wallets exported to CSV.", LogType.SUCCESS);
  };

  const runSimulation = async () => {
    if (isRunning) return;
    if (!isValidPrivateKey(funderKey)) {
        addLog("Invalid Funder Private Key", LogType.ERROR);
        return;
    }
    if (!targetContract) {
        addLog("Target Contract address required", LogType.ERROR);
        return;
    }

    setIsRunning(true);
    setStats({ totalTx: 0, successfulTx: 0, failedTx: 0 });
    addLog(`INITIATING PROOF OF SHIP SEQUENCE...`, LogType.INFO);
    addLog(`TARGET: ${targetContract}`, LogType.INFO);

    try {
      // 1. Create Wallets
      let newWallets: WalletAccount[] = [];
      if (walletMode === 'generate') {
          addLog(`Generating ${walletCount} fresh wallets...`, LogType.INFO);
          newWallets = createWallets(walletCount);
          addLog(`Wallets generated successfully.`, LogType.SUCCESS);
      } else {
          addLog(`Parsing imported keys...`, LogType.INFO);
          const keys = importText.split('\n');
          newWallets = createWalletsFromKeys(keys);
          if (newWallets.length === 0) {
              throw new Error("No valid keys found.");
          }
          addLog(`Imported ${newWallets.length} wallets.`, LogType.SUCCESS);
      }
      
      setWallets(newWallets);

      // 2. Fund Wallets
      addLog(`Dispersing funds...`, LogType.INFO);
      const fundAmount = "0.01"; 

      await fundWallets(funderKey, newWallets, fundAmount, (index, txHash) => {
         addLog(`Funded Wallet ${index + 1}`, LogType.SUCCESS, txHash);
         setWallets(prev => {
             const updated = [...prev];
             if (updated[index]) updated[index].status = 'funding';
             return updated;
         });
      });

      // 3. Execute Interactions
      addLog(`Starting Transaction Swarm: ${interactionsPerWallet} tx/wallet`, LogType.INFO);
      
      const walletPromises = newWallets.map(async (wallet, wIndex) => {
          for (let i = 0; i < interactionsPerWallet; i++) {
              setWallets(prev => {
                const updated = [...prev];
                if (updated[wIndex]) updated[wIndex].status = 'sending';
                return updated;
              });

              try {
                  const hash = await executeInteraction(wallet, targetContract, customData);
                  addLog(`[W${wIndex + 1}] Tx ${i + 1}/${interactionsPerWallet} confirmed`, LogType.SUCCESS, hash);
                  setStats(s => ({ ...s, totalTx: s.totalTx + 1, successfulTx: s.successfulTx + 1 }));
                  
                  setWallets(prev => {
                    const updated = [...prev];
                    if (updated[wIndex]) updated[wIndex].txCount += 1;
                    return updated;
                  });
              } catch (error) {
                  addLog(`[W${wIndex + 1}] Tx Failed`, LogType.ERROR);
                  setStats(s => ({ ...s, totalTx: s.totalTx + 1, failedTx: s.failedTx + 1 }));
                  setWallets(prev => {
                    const updated = [...prev];
                    if (updated[wIndex]) updated[wIndex].status = 'error';
                    return updated;
                  });
              }
              await new Promise(r => setTimeout(r, 200)); 
          }
          setWallets(prev => {
            const updated = [...prev];
            if (updated[wIndex]) updated[wIndex].status = 'done';
            return updated;
          });
      });

      await Promise.all(walletPromises);
      addLog("SEQUENCE COMPLETE.", LogType.SUCCESS);

    } catch (error) {
      addLog(`CRITICAL FAILURE: ${(error as Error).message}`, LogType.ERROR);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      
      {/* HEADER SECTION */}
      <header className="w-full max-w-7xl mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-2 border-celo-black pb-6">
        <div>
           <h1 className="text-7xl md:text-8xl font-serif italic font-medium tracking-tight leading-none text-celo-black mb-2">
             CeloShip
           </h1>
           <p className="text-xl font-bold font-sans uppercase tracking-widest flex items-center gap-2">
             <span className="bg-celo-black text-celo-bg px-2 py-1">Mainnet</span>
             Load Tester
           </p>
        </div>
        <div className="flex flex-col items-end gap-2">
             <div className="flex items-center gap-2 font-mono text-sm font-bold bg-white border-2 border-celo-black px-3 py-1 shadow-brutal-sm">
                <div className="w-3 h-3 bg-celo-green rounded-full animate-pulse border border-black"></div>
                Connected to Forno
             </div>
             <div className="text-right text-xs font-mono opacity-60 max-w-[200px]">
                Ensure you are using a burner wallet for the Funder Key.
             </div>
        </div>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: CONTROLS (5 cols) */}
        <div className="lg:col-span-4 space-y-8">
            
            {/* 1. CONFIGURATION CARD */}
            <div className="bg-white border-2 border-celo-black shadow-brutal p-6 relative">
                <div className="absolute -top-4 -left-2 bg-celo-black text-white px-3 py-1 font-mono text-sm font-bold transform -rotate-2">
                    STEP 1: TARGET
                </div>
                
                <div className="space-y-6 mt-2">
                    <div>
                        <label className="block text-sm font-bold uppercase mb-2">Target Contract</label>
                        <input 
                            type="text" 
                            className="w-full bg-celo-gray border-2 border-celo-black p-3 font-mono text-sm focus:bg-white focus:shadow-brutal-sm outline-none transition-all placeholder-gray-400"
                            placeholder="0x..."
                            value={targetContract}
                            onChange={e => setTargetContract(e.target.value)}
                        />
                    </div>

                    <div className="bg-celo-gray border-2 border-celo-black p-4">
                        <div className="flex gap-2 mb-4">
                            <button 
                                onClick={() => setWalletMode('generate')}
                                className={`flex-1 py-2 text-xs font-bold uppercase border-2 border-celo-black transition-all ${
                                    walletMode === 'generate' 
                                    ? 'bg-celo-black text-white shadow-brutal-sm' 
                                    : 'bg-white hover:bg-gray-100'
                                }`}
                            >
                                Generate
                            </button>
                            <button 
                                onClick={() => setWalletMode('import')}
                                className={`flex-1 py-2 text-xs font-bold uppercase border-2 border-celo-black transition-all ${
                                    walletMode === 'import' 
                                    ? 'bg-celo-black text-white shadow-brutal-sm' 
                                    : 'bg-white hover:bg-gray-100'
                                }`}
                            >
                                Import
                            </button>
                        </div>

                        {walletMode === 'generate' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1">Wallets</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                        value={walletCount}
                                        onChange={e => setWalletCount(parseInt(e.target.value))}
                                        min={1} max={50}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1">Tx / Wallet</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                        value={interactionsPerWallet}
                                        onChange={e => setInteractionsPerWallet(parseInt(e.target.value))}
                                        min={1} max={100}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <textarea 
                                    className="w-full h-24 border-2 border-celo-black p-2 font-mono text-xs outline-none focus:bg-white resize-none"
                                    placeholder="Paste Private Keys (one per line)"
                                    value={importText}
                                    onChange={e => setImportText(e.target.value)}
                                />
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1">Tx / Wallet</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                        value={interactionsPerWallet}
                                        onChange={e => setInteractionsPerWallet(parseInt(e.target.value))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold uppercase mb-2 flex items-center justify-between">
                            Funder Private Key
                            <ShieldCheck className="w-4 h-4" />
                        </label>
                        <input 
                            type="password" 
                            className="w-full bg-celo-gray border-2 border-celo-black p-3 font-mono text-sm focus:bg-white focus:shadow-brutal-sm outline-none transition-all"
                            placeholder="Private Key (Master Wallet)"
                            value={funderKey}
                            onChange={e => setFunderKey(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* 2. GEMINI AI CARD */}
            <div className="bg-celo-purple border-2 border-celo-black shadow-brutal p-6 relative">
                 <div className="absolute -top-4 -right-2 bg-celo-black text-white px-3 py-1 font-mono text-sm font-bold transform rotate-2">
                    STEP 2: STRATEGY
                </div>
                <div className="flex items-center gap-2 mb-4">
                    <Cpu className="w-5 h-5" />
                    <h2 className="font-serif italic text-2xl">Payload Architect</h2>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        {['Transfer', 'Approve', 'Vote', 'Mint'].map((action) => (
                            <button 
                                key={action}
                                onClick={() => handleAiGeneration(`${action} action`)}
                                disabled={isGeneratingAi}
                                className="bg-white border-2 border-celo-black py-2 px-3 font-bold hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none shadow-brutal-sm transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                            >
                                {action}
                            </button>
                        ))}
                    </div>

                    <div className="relative">
                        <input 
                            type="text"
                            className="w-full border-2 border-celo-black p-3 pr-10 font-mono text-xs focus:shadow-brutal-sm outline-none"
                            placeholder="Or describe custom intent..."
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAiGeneration()}
                        />
                        <button 
                             onClick={() => handleAiGeneration()}
                             disabled={isGeneratingAi}
                             className="absolute right-2 top-2 p-1 hover:bg-gray-100 rounded"
                         >
                            {isGeneratingAi ? <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full" /> : <ArrowRight className="w-4 h-4" />}
                        </button>
                    </div>

                    {customData && (
                        <div className="bg-white border-2 border-celo-black p-3 font-mono text-[10px] break-all">
                            <span className="bg-celo-black text-white px-1 mr-2">HEX</span>
                            {customData.slice(0, 40)}...
                        </div>
                    )}
                </div>
            </div>

            {/* START BUTTON */}
            <button 
                onClick={runSimulation}
                disabled={isRunning}
                className={`w-full py-6 text-xl font-serif italic border-2 border-celo-black shadow-brutal-lg hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal transition-all flex items-center justify-center gap-3 ${
                    isRunning ? 'bg-gray-300 cursor-not-allowed text-gray-600' : 'bg-celo-black text-celo-bg'
                }`}
            >
                {isRunning ? 'Running Simulation...' : 'Launch Sequence'}
                {!isRunning && <Rocket className="w-6 h-6" />}
            </button>

        </div>

        {/* RIGHT COLUMN: VISUALIZATION (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-8">
            
            {/* STATS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-celo-green border-2 border-celo-black shadow-brutal p-4 flex flex-col justify-between h-32">
                    <span className="font-bold text-xs uppercase tracking-wider border-b-2 border-black pb-1 w-fit">Total Txs</span>
                    <span className="text-5xl font-serif font-medium">{stats.totalTx}</span>
                </div>
                <div className="bg-celo-orange border-2 border-celo-black shadow-brutal p-4 flex flex-col justify-between h-32">
                    <span className="font-bold text-xs uppercase tracking-wider border-b-2 border-black pb-1 w-fit">Success Rate</span>
                    <span className="text-5xl font-serif font-medium">
                         {stats.totalTx > 0 ? ((stats.successfulTx / stats.totalTx) * 100).toFixed(0) : 0}%
                    </span>
                </div>
                <div className="bg-white border-2 border-celo-black shadow-brutal p-4 flex flex-col justify-between h-32">
                    <span className="font-bold text-xs uppercase tracking-wider border-b-2 border-black pb-1 w-fit">Active Fleet</span>
                    <span className="text-5xl font-serif font-medium">
                        {wallets.filter(w => w.status !== 'idle' && w.status !== 'done').length}
                        <span className="text-xl text-gray-400 font-sans ml-2">/ {wallets.length}</span>
                    </span>
                </div>
            </div>

            {/* LOG CONSOLE */}
            <div className="flex-1 min-h-[300px] border-2 border-celo-black bg-white shadow-brutal flex flex-col relative">
                <div className="bg-celo-black text-white px-4 py-2 font-mono text-sm font-bold flex justify-between items-center">
                    <span>> OPERATION_LOGS</span>
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500 border border-white"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500 border border-white"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500 border border-white"></div>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden p-2">
                    <LogConsole logs={logs} />
                </div>
            </div>

            {/* WALLET GRID */}
            <div className="border-2 border-celo-black bg-celo-blue/20 p-6 shadow-brutal">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-serif italic text-2xl">Wallet Fleet</h3>
                    {wallets.length > 0 && (
                        <button 
                            onClick={handleDownloadWallets}
                            className="bg-white border-2 border-celo-black px-3 py-1 text-xs font-bold hover:shadow-brutal-sm transition-all flex items-center gap-2"
                        >
                            <Download className="w-3 h-3" /> CSV
                        </button>
                    )}
                </div>
                
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {wallets.map((wallet, idx) => (
                        <div key={idx} className="bg-white border-2 border-celo-black p-2 relative group hover:-translate-y-1 transition-transform">
                            <div className={`absolute top-0 right-0 w-3 h-3 border-l-2 border-b-2 border-celo-black ${
                                wallet.status === 'done' ? 'bg-celo-green' :
                                wallet.status === 'error' ? 'bg-red-500' :
                                wallet.status === 'sending' ? 'bg-celo-orange animate-pulse' : 'bg-gray-300'
                            }`} />
                            <div className="font-bold text-xs mb-1">W{idx + 1}</div>
                            <div className="text-[10px] font-mono text-gray-500 truncate">{wallet.address}</div>
                            <div className="mt-2 text-xs font-bold text-right">{wallet.txCount} tx</div>
                        </div>
                    ))}
                    {wallets.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500 font-mono text-sm border-2 border-dashed border-gray-400 bg-white/50">
                            Fleet not initialized
                        </div>
                    )}
                </div>
            </div>

        </div>

      </main>
    </div>
  );
};

export default App;