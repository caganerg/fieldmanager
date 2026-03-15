"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Settings } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 dark:bg-slate-950">
      <header className="h-16 border-b bg-white dark:bg-slate-900 flex items-center px-6 shadow-sm z-10 gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="rounded-full"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-600" />
          <h1 className="text-xl font-bold tracking-tight">Ayarlar</h1>
        </div>
      </header>
      
      <main className="flex-1 p-8 flex flex-col items-center justify-center">
        <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Settings className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Ayarlar Sayfası</h2>
          <p className="text-slate-500 dark:text-slate-400">
            Yakında buraya ayarlar seçenekleri eklenecektir.
          </p>
        </div>
      </main>
    </div>
  );
}
