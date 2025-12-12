import { JsonRpcProvider, Wallet, parseEther, formatEther } from 'ethers';
import { CELO_RPC_URL } from '../constants';
import { WalletAccount } from '../types';

// We rely on standard ethers provider
const provider = new JsonRpcProvider(CELO_RPC_URL);

export const createWallets = (count: number): WalletAccount[] => {
  const wallets: WalletAccount[] = [];
  for (let i = 0; i < count; i++) {
    const wallet = Wallet.createRandom();
    wallets.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      balance: '0',
      txCount: 0,
      status: 'idle'
    });
  }
  return wallets;
};

export const createWalletsFromKeys = (keys: string[]): WalletAccount[] => {
  const wallets: WalletAccount[] = [];
  for (const key of keys) {
    if (!key || key.trim() === '') continue;
    try {
        const cleanKey = key.trim();
        const wallet = new Wallet(cleanKey);
        wallets.push({
          address: wallet.address,
          privateKey: wallet.privateKey,
          balance: '0',
          txCount: 0,
          status: 'idle'
        });
    } catch (e) {
        console.warn(`Invalid key skipped during import: ${key}`);
    }
  }
  return wallets;
};

export const getBalance = async (address: string): Promise<string> => {
  try {
    const balance = await provider.getBalance(address);
    return formatEther(balance);
  } catch (error) {
    console.error("Error fetching balance:", error);
    return '0';
  }
};

export const getWalletNonce = async (address: string): Promise<number> => {
    return await provider.getTransactionCount(address);
};

export const getWalletInfo = async (privateKey: string): Promise<{ address: string, balance: string } | null> => {
    try {
        const wallet = new Wallet(privateKey, provider);
        const balanceWei = await provider.getBalance(wallet.address);
        return {
            address: wallet.address,
            balance: formatEther(balanceWei)
        };
    } catch (e) {
        return null;
    }
};

export const fundWallets = async (
  funderPrivateKey: string, 
  targets: WalletAccount[], 
  amountPerWallet: string,
  onProgress: (index: number, txHash: string) => void
) => {
  const funder = new Wallet(funderPrivateKey, provider);
  const amountWei = parseEther(amountPerWallet);

  // In a real load test, we might batch this or use a dispenser contract.
  // For this simplified app, we send 1-by-1 linearly for safety and clarity.
  
  for (let i = 0; i < targets.length; i++) {
    try {
        const tx = await funder.sendTransaction({
          to: targets[i].address,
          value: amountWei
        });
        
        // BLOCKING: Wait for 1 confirmation to ensure funds are usable
        await tx.wait(1); 
        
        // Notify only after confirmation
        onProgress(i, tx.hash);
    } catch (e) {
        console.error("Funding failed for wallet " + i, e);
        // Continue funding others even if one fails
    }
  }
};

export const executeInteraction = async (
  walletData: WalletAccount,
  targetContract: string,
  data: string,
  nonce?: number
): Promise<string> => {
  const wallet = new Wallet(walletData.privateKey, provider);
  
  const txRequest: any = {
    to: targetContract,
    value: 0, // Assuming simple interaction, not sending value to contract
    data: data || '0x' // Default to empty data if null
  };

  if (nonce !== undefined) {
      txRequest.nonce = nonce;
  }
  
  const tx = await wallet.sendTransaction(txRequest);

  return tx.hash;
};

export const isValidPrivateKey = (key: string): boolean => {
  try {
    new Wallet(key);
    return true;
  } catch {
    return false;
  }
};