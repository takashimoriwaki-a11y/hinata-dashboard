/**
 * Schedule - 訪問スケジュールページ
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const teams = ["身体", "天理", "郡山北部", "郡山南部"];
const days = ["今日", "明日"];

const scheduleData: Record<string, Record<string, { time: string; patient: string; nurse: string }[]>> = {
  "身体": {
    "今日": [
      { time: "09:00", patient: "岡田 徳子", nurse: "山田看護師" },
      { time: "10:30", patient: "鈴木 一郎", nurse: "田中看護師" },
      { time: "13:00", patient: "中村 道子", nurse: "山田看護師" },
    ],
    "明日": [
      { time: "09:30", patient: "岡田 徳子", nurse: "山田看護師" },
      { time: "11:00", patient: "鈴木 一郎", nurse: "田中看護師" },
    ],
  },
  "天理": {
    "今日": [
      { time: "10:00", patient: "湯浅 全人", nurse: "佐藤OT" },
      { time: "14:00", patient: "佐藤 幸子", nurse: "高橋看護師" },
    ],
    "明日": [
      { time: "10:00", patient: "湯浅 全人", nurse: "佐藤OT" },
    ],
  },
  "郡山北部": {
    "今日": [
      { time: "09:00", patient: "田中 花子", nurse: "伊藤看護師" },
    ],
    "明日": [],
  },
  "郡山南部": {
    "今日": [
      { time: "11:00", patient: "山田 太郎", nurse: "渡辺看護師" },
      { time: "15:00", patient: "小林 節子", nurse: "渡辺看護師" },
    ],
    "明日": [
      { time: "11:00", patient: "山田 太郎", nurse: "渡辺看護師" },
    ],
  },
};

export default function Schedule() {
  const [selectedTeam, setSelectedTeam] = useState("身体");
  const [selectedDay, setSelectedDay] = useState("今日");

  const schedule = scheduleData[selectedTeam]?.[selectedDay] || [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">訪問スケジュール</h1>
        <a
          href="https://zest.jp/"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          ZESTで管理
        </a>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              {teams.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={selectedTeam === t ? "default" : "outline"}
                  className="h-7 text-xs px-3"
                  onClick={() => setSelectedTeam(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto">
              {days.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={selectedDay === d ? "default" : "outline"}
                  className="h-7 text-xs px-3"
                  onClick={() => setSelectedDay(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {selectedTeam}チーム / {selectedDay}
          </p>
          {schedule.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">スケジュールはありません</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 text-xs"
                onClick={() => toast.info("スクリーンショットをアップロードしてください")}
              >
                スクリーンショットを登録
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {schedule.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg">
                  <span className="text-sm font-mono font-semibold text-primary w-12 flex-shrink-0">
                    {item.time}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.patient}</p>
                    <p className="text-xs text-muted-foreground">{item.nurse}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">訪問予定</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
