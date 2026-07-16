import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#666666", marginBottom: 20 },
  item: { marginBottom: 14 },
  questionRow: { flexDirection: "row" },
  index: { width: 24, fontFamily: "Helvetica-Bold" },
  questionText: { flex: 1, fontFamily: "Helvetica-Bold", lineHeight: 1.35 },
  categoryLabel: { marginTop: 2, marginLeft: 24, fontSize: 9, color: "#888888" },
  answerText: { marginTop: 4, marginLeft: 24, color: "#333333", lineHeight: 1.4 },
});

const VARIANT_TITLES = {
  all: "All Questions",
  answered: "Answered Questions",
  unanswered: "Unanswered Questions",
} as const;

export type PdfVariant = keyof typeof VARIANT_TITLES;

export interface PdfQuestionItem {
  id: string;
  text: string;
  category: QuestionCategory;
  answer: string | null;
}

export function InterviewQuestionsPdf({ variant, items }: { variant: PdfVariant; items: PdfQuestionItem[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>KMate Interview DB — {VARIANT_TITLES[variant]}</Text>
        <Text style={styles.subtitle}>
          {items.length} question{items.length === 1 ? "" : "s"} · Generated {new Date().toLocaleDateString()}
        </Text>
        {items.map((item, i) => (
          <View key={item.id} style={styles.item} wrap>
            <View style={styles.questionRow}>
              <Text style={styles.index}>{i + 1}.</Text>
              <Text style={styles.questionText}>{item.text}</Text>
            </View>
            <Text style={styles.categoryLabel}>{QUESTION_CATEGORY_LABELS[item.category]}</Text>
            {item.answer && <Text style={styles.answerText}>{item.answer}</Text>}
          </View>
        ))}
      </Page>
    </Document>
  );
}
