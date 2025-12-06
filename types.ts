export enum LogType {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  WARNING = 'WARNING'
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: LogType;
  txHash?: string;
}

export interface WalletAccount {
  address: string;
  privateKey: string;
  balance: string;
  txCount: number;
  status: 'idle' | 'funding' | 'sending' | 'done' | 'error';
}

export interface SimulationConfig {
  targetContract: string;
  walletCount: number;
  interactionsPerWallet: number;
  funderPrivateKey: string; // The master wallet to fund sub-wallets
  customData: string; // Hex data for the transaction
  gasPriceMultiplier: number; // For aggressive testing
}

export interface GeminiSuggestion {
  reasoning: string;
  hexData: string;
}
