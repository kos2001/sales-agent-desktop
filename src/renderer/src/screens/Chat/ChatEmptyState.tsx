import { memo } from "react";
import {
  NotebookPen,
  Mail,
  Building2,
  TriangleAlert,
  FileText,
  ListChecks,
  TrendingUp,
  Boxes,
  LayoutGrid,
} from "lucide-react";
import icon from "../../assets/icon.png";
import { useI18n } from "../../components/useI18n";

interface Suggestion {
  i18nKey: string;
  /**
   * The prompt actually sent. Each one is phrased to reach for a skill seeded
   * by `sales-harness.ts`; `skill` records which, and the contract test in
   * `tests/chat-suggestions.test.ts` keeps these six in step with what ships in
   * `resources/sales-skills/sales/`.
   */
  skill: string;
  textKey: string;
  Icon: typeof Mail;
}

const SUGGESTIONS: Suggestion[] = [
  {
    i18nKey: "chat.suggestionDiscovery",
    skill: "discovery-notes",
    textKey: "chat.suggestionDiscoveryPrompt",
    Icon: NotebookPen,
  },
  {
    i18nKey: "chat.suggestionFollowup",
    skill: "followup-email",
    textKey: "chat.suggestionFollowupPrompt",
    Icon: Mail,
  },
  {
    i18nKey: "chat.suggestionAccountBrief",
    skill: "account-brief",
    textKey: "chat.suggestionAccountBriefPrompt",
    Icon: Building2,
  },
  {
    i18nKey: "chat.suggestionDealRisk",
    skill: "deal-risk-review",
    textKey: "chat.suggestionDealRiskPrompt",
    Icon: TriangleAlert,
  },
  {
    i18nKey: "chat.suggestionProposal",
    skill: "proposal-outline",
    textKey: "chat.suggestionProposalPrompt",
    Icon: FileText,
  },
  {
    i18nKey: "chat.suggestionPipeline",
    skill: "pipeline-hygiene",
    textKey: "chat.suggestionPipelinePrompt",
    Icon: ListChecks,
  },
  {
    i18nKey: "chat.suggestionMarketTrend",
    skill: "market-trend-brief",
    textKey: "chat.suggestionMarketTrendPrompt",
    Icon: TrendingUp,
  },
  {
    i18nKey: "chat.suggestionSupply",
    skill: "supply-allocation",
    textKey: "chat.suggestionSupplyPrompt",
    Icon: Boxes,
  },
];

export const SALES_SUGGESTIONS = SUGGESTIONS;

interface ChatEmptyStateProps {
  onSelectSuggestion: (text: string) => void;
  /**
   * Opens the Tasks launcher. These six shortcuts are a fraction of what
   * ships, so the empty state has to say where the rest are.
   */
  onBrowseTasks?: () => void;
}

export const ChatEmptyState = memo(function ChatEmptyState({
  onSelectSuggestion,
  onBrowseTasks,
}: ChatEmptyStateProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className="chat-empty">
      <div className="chat-empty-icon">
        <img src={icon} width={64} height={64} alt="" />
      </div>
      <div className="chat-empty-text">{t("chat.emptyTitle")}</div>
      <div className="chat-empty-hint">{t("chat.emptyHint")}</div>
      <div className="chat-empty-suggestions">
        {SUGGESTIONS.map(({ i18nKey, textKey, Icon }) => (
          <button
            key={i18nKey}
            className="chat-suggestion"
            onClick={() => onSelectSuggestion(t(textKey))}
          >
            <Icon size={16} />
            {t(i18nKey)}
          </button>
        ))}
      </div>
      {onBrowseTasks && (
        <button
          type="button"
          className="chat-empty-browse"
          onClick={onBrowseTasks}
        >
          <LayoutGrid size={14} aria-hidden />
          {t("tasks.seeAllTasks")}
        </button>
      )}
    </div>
  );
});
