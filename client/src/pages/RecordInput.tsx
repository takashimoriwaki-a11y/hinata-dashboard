/**
 * RecordInput - 訪問記録入力ページ
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardEdit, Mic, Send } from "lucide-react";
import { toast } from "sonner";

const teams = ["身体チーム", "天理チーム", "郡山北部チーム", "郡山南部チーム"];
const patients = [
  "田中 花子", "山田 太郎", "鈴木 一郎", "佐藤 幸子", "高橋 次郎",
];

export default function RecordInput() {
  const [team, setTeam] = useState("");
  const [patient, setPatient] = useState("");
  const [memo, setMemo] = useState("");

  const handleSubmit = () => {
    if (!patient || !memo) {
      toast.error("利用者と記録内容を入力してください");
      return;
    }
    toast.success("記録を送信しました");
    setMemo("");
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardEdit className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">訪問記録入力</h1>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">① 利用者・次回訪問日時</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">チーム</label>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="チームを選択（全員表示）" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">利用者を選択または検索 *</label>
            <div className="flex gap-2">
              <Select value={patient} onValueChange={setPatient}>
                <SelectTrigger className="text-sm flex-1">
                  <SelectValue placeholder="名前で検索..." />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => toast.info("音声入力は準備中です")}>
                <Mic className="w-4 h-4 mr-1" />
                音声入力
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">③ 病状の経過</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">本日観察・収集した情報</label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.info("音声入力は準備中です")}>
                <Mic className="w-3 h-3 mr-1" />
                音声入力
              </Button>
            </div>
            <Textarea
              placeholder="本日の訪問で観察した症状・状態・利用者の言葉・環境の変化などをメモしてください..."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="min-h-[120px] text-sm"
            />
          </div>
          <Button className="w-full" onClick={handleSubmit}>
            <Send className="w-4 h-4 mr-2" />
            スプレッドシートへ転送
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
