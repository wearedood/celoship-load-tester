import React, { useState, useEffect, useCallback } from 'react';
import { Rocket, ShieldCheck, Cpu, ArrowRight, Download, Zap, RefreshCw, Trash2 } from 'lucide-react';
import LogConsole from './components/LogConsole';
import { LogEntry, LogType, WalletAccount } from './types';
import { createWallets, createWalletsFromKeys, fundWallets, executeInteraction, isValidPrivateKey, getWalletInfo, getBalance, getWalletNonce } from './services/celoService';
import { generateInteractionData, analyzeContractStrategy } from './services/geminiService';

const App: React.FC = () => {
  const [isFunding, setIsFunding] = useState(false);
  const [isSwarming, setIsSwarming] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [wallets, setWallets] = useState<WalletAccount[]>([]);
  const [stats, setStats] = useState({ totalTx: 0, successfulTx: 0, failedTx: 0 });
  
  // Form State
  const [targetContract, setTargetContract] = useState('');
  const [walletMode, setWalletMode] = useState<'generate' | 'import'>('generate');
  const [walletCount, setWalletCount] = useState(5);
  const [importText, setImportText] = useState('');
  const [interactionsPerWallet, setInteractionsPerWallet] = useState(10);
  const [fundingAmount, setFundingAmount] = useState('0.01');
  const [funderKey, setFunderKey] = useState('');
  const [funderBalance, setFunderBalance] = useState<string | null>(null);
  const [customData, setCustomData] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiStrategy, setAiStrategy] = useState('');
  const [gasLimit, setGasLimit] = useState(300000);

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

  // Fetch Funder Balance when key changes
  useEffect(() => {
      const checkBalance = async () => {
          if (isValidPrivateKey(funderKey)) {
              const info = await getWalletInfo(funderKey);
              if (info) {
                  setFunderBalance(info.balance);
              }
          } else {
              setFunderBalance(null);
          }
      };
      
      const timer = setTimeout(checkBalance, 500); // Debounce
      return () => clearTimeout(timer);
  }, [funderKey]);

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
        + "Index,Address,PrivateKey,Status,TxCount,Balance\n"
        + wallets.map((w, i) => `${i+1},${w.address},${w.privateKey},${w.status},${w.txCount},${w.balance}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `celoship_wallets_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog("Wallets exported to CSV.", LogType.SUCCESS);
  };

  const updateFleetBalances = async (currentWallets: WalletAccount[]) => {
      addLog("Refreshing fleet balances...", LogType.INFO);
      const updatedWallets = [...currentWallets];
      
      // Update in chunks or one by one
      for (let i = 0; i < updatedWallets.length; i++) {
          const bal = await getBalance(updatedWallets[i].address);
          updatedWallets[i].balance = bal;
      }
      setWallets(updatedWallets);
  };

  const prepareFleet = (): WalletAccount[] => {
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
              addLog("No valid keys found in import.", LogType.ERROR);
              return [];
          }
          addLog(`Imported ${newWallets.length} wallets.`, LogType.SUCCESS);
      }
      setWallets(newWallets);
      return newWallets;
  };

  const resetFleet = () => {
      setWallets([]);
      setStats({ totalTx: 0, successfulTx: 0, failedTx: 0 });
      addLog("Fleet reset. Ready for new configuration.", LogType.INFO);
  };

  const handleFundFleet = async () => {
      if (isFunding || isSwarming) return;
      
      if (!isValidPrivateKey(funderKey)) {
          addLog("Invalid Funder Private Key", LogType.ERROR);
          return;
      }

      setIsFunding(true);
      
      try {
          // 1. Ensure Wallets Exist
          let currentWallets = wallets;
          if (currentWallets.length === 0) {
              currentWallets = prepareFleet();
              if (currentWallets.length === 0) throw new Error("Failed to initialize fleet.");
          }

          // 2. Fund Wallets
          addLog(`Dispersing ${fundingAmount} CELO to ${currentWallets.length} wallets (Blocking)...`, LogType.INFO);
          
          await fundWallets(funderKey, currentWallets, fundingAmount, (index, txHash) => {
             addLog(`Funded Wallet ${index + 1} - Confirmed`, LogType.SUCCESS, txHash);
             setWallets(prev => {
                 const updated = [...prev];
                 if (updated[index]) updated[index].status = 'funding';
                 return updated;
             });
          });
          
          addLog("Funds confirmed. Waiting 3s for network propagation...", LogType.WARNING);
          await new Promise(resolve => setTimeout(resolve, 3000));

          await updateFleetBalances(currentWallets);
          addLog("Funding sequence complete. Fleet Ready.", LogType.SUCCESS);

      } catch (error) {
          addLog(`Funding Error: ${(error as Error).message}`, LogType.ERROR);
      } finally {
          setIsFunding(false);
      }
  };

  const handleStartSwarm = async () => {
      if (isFunding || isSwarming) return;

      if (!targetContract) {
          addLog("Target Contract address required", LogType.ERROR);
          return;
      }

      if (wallets.length === 0) {
          addLog("No active fleet. Generate or Fund first.", LogType.ERROR);
          return;
      }

      setIsSwarming(true);
      setStats({ totalTx: 0, successfulTx: 0, failedTx: 0 });
      addLog(`INITIATING SWARM SEQUENCE...`, LogType.INFO);
      addLog(`TARGET: ${targetContract}`, LogType.INFO);
      addLog(`INTENSITY: ${interactionsPerWallet} txs per wallet`, LogType.INFO);
      addLog(`GAS LIMIT: ${gasLimit} (Estimation Skipped)`, LogType.INFO);

      try {
          const walletPromises = wallets.map(async (wallet, wIndex) => {
              // 1. Manual Nonce Management: Fetch start nonce once per wallet
              let nonce = 0;
              try {
                nonce = await getWalletNonce(wallet.address);
              } catch (e) {
                addLog(`[W${wIndex + 1}] Failed to fetch initial nonce.`, LogType.ERROR);
                return;
              }

              for (let i = 0; i < interactionsPerWallet; i++) {
                  setWallets(prev => {
                    const updated = [...prev];
                    if (updated[wIndex]) updated[wIndex].status = 'sending';
                    return updated;
                  });
    
                  try {
                      // 2. Manual Nonce: Pass current nonce and increment locally
                      // 3. Skip Gas Estimation: Pass hardcoded gasLimit
                      const hash = await executeInteraction(wallet, targetContract, customData, nonce++, gasLimit);
                      
                      addLog(`[W${wIndex + 1}] Tx ${i + 1}/${interactionsPerWallet} confirmed`, LogType.SUCCESS, hash);
                      setStats(s => ({ ...s, totalTx: s.totalTx + 1, successfulTx: s.successfulTx + 1 }));
                      
                      setWallets(prev => {
                        const updated = [...prev];
                        if (updated[wIndex]) updated[wIndex].txCount += 1;
                        return updated;
                      });
                  } catch (error) {
                      // 3. Improved Error Logging
                      const reason = (error as any).reason || (error as any).message || "Unknown error";
                      addLog(`[W${wIndex + 1}] Tx Failed: ${reason}`, LogType.ERROR);
                      
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
          addLog("SWARM COMPLETE.", LogType.SUCCESS);
          
          setWallets(prev => {
              const w = [...prev];
              updateFleetBalances(w);
              return w;
          });
      } catch (error) {
          addLog(`Swarm Error: ${(error as Error).message}`, LogType.ERROR);
      } finally {
          setIsSwarming(false);
      }
  };

  const isBusy = isFunding || isSwarming;

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
                            <div className="space-y-3">
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
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase mb-1">Funding (CELO)</label>
                                        <input 
                                            type="text" 
                                            className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                            value={fundingAmount}
                                            onChange={e => setFundingAmount(e.target.value)}
                                            placeholder="0.01"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase mb-1">Gas Limit</label>
                                        <input 
                                            type="number" 
                                            className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                            value={gasLimit}
                                            onChange={e => setGasLimit(parseInt(e.target.value))}
                                            step={10000}
                                        />
                                    </div>
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
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase mb-1">Tx / Wallet</label>
                                        <input 
                                            type="number" 
                                            className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                            value={interactionsPerWallet}
                                            onChange={e => setInteractionsPerWallet(parseInt(e.target.value))}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase mb-1">Funding (CELO)</label>
                                        <input 
                                            type="text" 
                                            className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                            value={fundingAmount}
                                            onChange={e => setFundingAmount(e.target.value)}
                                            placeholder="0.01"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase mb-1">Gas Limit</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-2 border-celo-black p-2 font-mono text-sm outline-none focus:bg-white"
                                        value={gasLimit}
                                        onChange={e => setGasLimit(parseInt(e.target.value))}
                                        step={10000}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <label className="block text-sm font-bold uppercase flex items-center gap-2">
                                Funder Private Key
                                <ShieldCheck className="w-4 h-4" />
                            </label>
                            {funderBalance && (
                                <span className="text-xs font-mono font-bold bg-celo-black text-white px-2 py-0.5">
                                    BAL: {parseFloat(funderBalance).toFixed(3)} CELO
                                </span>
                            )}
                        </div>
                       
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

            {/* CONTROL PANEL */}
            <div className="grid grid-cols-2 gap-4">
                <button 
                    onClick={handleFundFleet}
                    disabled={isBusy}
                    className={`w-full py-6 text-xl font-serif italic border-2 border-celo-black shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal-sm transition-all flex flex-col items-center justify-center gap-2 ${
                        isBusy ? 'bg-gray-200 cursor-not-allowed text-gray-400' : 'bg-celo-green text-celo-black'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span>Fund Fleet</span>
                        <Zap className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-sans not-italic font-bold uppercase opacity-80">
                        {isFunding ? 'Funding...' : 'Deploy & Fund'}
                    </span>
                </button>

                <button 
                    onClick={handleStartSwarm}
                    disabled={isBusy || wallets.length === 0}
                    className={`w-full py-6 text-xl font-serif italic border-2 border-celo-black shadow-brutal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brutal-sm transition-all flex flex-col items-center justify-center gap-2 ${
                        isBusy || wallets.length === 0 ? 'bg-gray-200 cursor-not-allowed text-gray-400' : 'bg-celo-black text-celo-bg'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span>Start Swarm</span>
                        <Rocket className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-sans not-italic font-bold uppercase opacity-80">
                        {isSwarming ? 'Attacking...' : 'Execute Txs'}
                    </span>
                </button>
            </div>

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
                        {wallets.length > 0 ? wallets.filter(w => w.status !== 'idle' && w.status !== 'done').length : 0}
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
            <div className="border-2 border-celo-black bg-celo-blue/20 p-6 shadow-brutal relative">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <h3 className="font-serif italic text-2xl">Wallet Fleet</h3>
                        {wallets.length > 0 && (
                            <button 
                                onClick={resetFleet}
                                className="bg-white/50 p-1 hover:bg-red-100 hover:text-red-500 rounded border border-transparent hover:border-red-500 transition-all"
                                title="Reset Fleet"
                                disabled={isBusy}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {wallets.length > 0 && (
                            <button 
                                onClick={() => updateFleetBalances(wallets)}
                                className="bg-white border-2 border-celo-black px-3 py-1 text-xs font-bold hover:shadow-brutal-sm transition-all flex items-center gap-2"
                                disabled={isBusy}
                            >
                                <RefreshCw className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`} /> Refresh
                            </button>
                        )}
                        {wallets.length > 0 && (
                            <button 
                                onClick={handleDownloadWallets}
                                className="bg-white border-2 border-celo-black px-3 py-1 text-xs font-bold hover:shadow-brutal-sm transition-all flex items-center gap-2"
                            >
                                <Download className="w-3 h-3" /> CSV
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {wallets.map((wallet, idx) => (
                        <div key={idx} className="bg-white border-2 border-celo-black p-2 relative group hover:-translate-y-1 transition-transform">
                            <div className={`absolute top-0 right-0 w-3 h-3 border-l-2 border-b-2 border-celo-black ${
                                wallet.status === 'done' ? 'bg-celo-green' :
                                wallet.status === 'error' ? 'bg-red-500' :
                                wallet.status === 'sending' ? 'bg-celo-orange animate-pulse' : 
                                wallet.status === 'funding' ? 'bg-celo-purple animate-pulse' : 'bg-gray-300'
                            }`} />
                            <div className="font-bold text-xs mb-1">W{idx + 1}</div>
                            <div className="text-[10px] font-mono text-gray-500 truncate">{wallet.address}</div>
                             <div className="text-[10px] font-mono text-celo-black font-bold truncate mt-1">
                                {wallet.balance ? parseFloat(wallet.balance).toFixed(3) : '0'} CELO
                            </div>
                            <div className="mt-1 text-[10px] font-bold text-right text-gray-400">{wallet.txCount} tx</div>
                        </div>
                    ))}
                    {wallets.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500 font-mono text-sm border-2 border-dashed border-gray-400 bg-white/50 flex flex-col items-center justify-center gap-2">
                            <span>Fleet not initialized</span>
                            <span className="text-xs opacity-60">Click "Fund Fleet" to generate</span>
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