import React, { useEffect, useRef } from 'react';
import { LogEntry, LogType } from '../types';
import { ExternalLink } from 'lucide-react';
import { EXPLORER_URL } from '../constants';

interface LogConsoleProps {
  logs: LogEntry[];
}

const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const getTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="h-full overflow-y-auto font-mono text-xs p-2 custom-scrollbar bg-white">
        {logs.length === 0 && (
          <div className="text-gray-400 italic p-4 text-center">
            > System waiting for inputs...
          </div>
        )}
        <table className="w-full text-left border-collapse">
            <tbody>
            {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                    <td className="py-1 px-2 text-gray-400 whitespace-nowrap w-[80px] align-top">{getTime(log.timestamp)}</td>
                    <td className={`py-1 px-2 font-bold w-[80px] align-top
                        ${log.type === LogType.SUCCESS ? 'text-green-600' : ''}
                        ${log.type === LogType.ERROR ? 'text-red-600' : ''}
                        ${log.type === LogType.WARNING ? 'text-orange-500' : ''}
                        ${log.type === LogType.INFO ? 'text-black' : ''}
                    `}>
                        [{log.type}]
                    </td>
                    <td className="py-1 px-2 text-black align-top break-all">
                        {log.message}
                        {log.txHash && (
                            <a 
                            href={`${EXPLORER_URL}/tx/${log.txHash}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="ml-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-black px-1 rounded inline-flex items-center no-underline"
                            >
                            HASH <ExternalLink className="w-2 h-2 ml-1" />
                            </a>
                        )}
                    </td>
                </tr>
            ))}
            </tbody>
        </table>
        <div ref={bottomRef} />
    </div>
  );
};

export default LogConsole;