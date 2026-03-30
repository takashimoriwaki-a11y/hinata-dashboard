import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Team = "身体" | "天理" | "郡山北部" | "郡山南部" | "事務員" | "全チーム";

const TEAMS: { value: Team; label: string; color: string }[] = [
  { value: "身体", label: "身体", color: "bg-[#4CAF82] hover:bg-[#3d9e72] text-white" },
  { value: "天理", label: "天理", color: "bg-[#4A90D9] hover:bg-[#3a7fc9] text-white" },
  { value: "郡山北部", label: "郡山北部", color: "bg-[#E8A838] hover:bg-[#d89828] text-white" },
  { value: "郡山南部", label: "郡山南部", color: "bg-[#C06BC0] hover:bg-[#b05bb0] text-white" },
  { value: "事務員", label: "事務員", color: "bg-gray-500 hover:bg-gray-600 text-white" },
  { value: "全チーム", label: "全チーム", color: "bg-[#E85C5C] hover:bg-[#d84c4c] text-white" },
];

interface TeamSetupModalProps {
  open: boolean;
  onComplete: () => void;
}

export function TeamSetupModal({ open, onComplete }: TeamSetupModalProps) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const utils = trpc.useUtils();

  const completeTeamSetup = trpc.userSettings.completeTeamSetup.useMutation({
    onSuccess: () => {
      utils.userSettings.getMyProfile.invalidate();
      utils.userSettings.getMyTeam.invalidate();
      toast.success(`${selectedTeam} チームに設定されました。`);
      onComplete();
    },
    onError: (err) => {
      toast.error(err.message ?? "エラーが発生しました");
    },
  });

  const handleConfirm = () => {
    if (!selectedTeam) return;
    completeTeamSetup.mutate({ team: selectedTeam });
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm mx-auto rounded-2xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-bold">
            ようこそ！チームを選択してください
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground">
            あなたが所属するチームを選択してください。
            <br />
            後から管理画面で変更できます。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          {TEAMS.map((team) => (
            <button
              key={team.value}
              onClick={() => setSelectedTeam(team.value)}
              className={`
                py-4 rounded-xl text-base font-semibold transition-all duration-150
                ${team.color}
                ${selectedTeam === team.value
                  ? "ring-4 ring-offset-2 ring-current scale-105 shadow-lg"
                  : "opacity-80 hover:opacity-100 hover:scale-102"}
              `}
            >
              {team.label}
            </button>
          ))}
        </div>

        <Button
          className="mt-4 w-full h-12 text-base font-bold"
          disabled={!selectedTeam || completeTeamSetup.isPending}
          onClick={handleConfirm}
        >
          {completeTeamSetup.isPending ? "設定中..." : selectedTeam ? `「${selectedTeam}」で確定する` : "チームを選択してください"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
