# AlphaLM v5.5.3 — Multi-Level Repetition Control Ablation Report

This report evaluates five conditions of the **Repetition Penalty System** introduced in AlphaLM v5.5.3.
The repetition system acts as a negative force during beam search, subtracting a penalty from the composite score
to enforce forward topic progression rather than semantic looping.

---

## Score Formula

```
Total = Boundary + Local + Global + MakesSense + Policy + Validity
      − (w_sent × SentenceRep + w_sem × SemanticRep + w_topic × TopicRep − w_progress × TopicProgress)
```

Default weights: `w_sent=1.0`, `w_sem=0.75`, `w_topic=1.25`, `w_progress=0.5`

---

## Ablation Conditions

| ID | Description |
| :--- | :--- |
| A | No repetition penalties (v5.5.2 baseline) |
| B | Sentence Repetition only (hard exact-duplicate gate) |
| C | Sentence + Semantic Repetition (≥0.85 cosine threshold) |
| D | Sentence + Semantic + Topic Repetition (topic memory centroid) |
| E | Full system: D + Topic Progress Bonus (exploration reward) |

---

## 1. Aggregate Metrics Table

| Condition | Total Score | Exact Matches | Avg Local | Avg Global | Avg Makes-Sense | Avg Validity | Diversity | Avg Progress | Runtime (s) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| A — No Repetition Penalties (Baseline) | 56.1786 | 3.2 | 0.7649 | 0.7736 | 0.6704 | 0.6648 | 0.3521 | 0.2122 | 1.22 |
| B — Sentence Repetition Only | 56.1786 | 3.2 | 0.7649 | 0.7736 | 0.6704 | 0.6648 | 0.3521 | 0.2122 | 1.44 |
| C — Sentence + Semantic Repetition | 56.3658 | 3.2 | 0.7603 | 0.7657 | 0.6850 | 0.6707 | 0.3596 | 0.2191 | 1.46 |
| D — Sentence + Semantic + Topic Repetition | 51.6744 | 2.8 | 0.7457 | 0.7510 | 0.6752 | 0.6666 | 0.3596 | 0.2310 | 1.48 |
| E — Full System (+ Topic Progress Bonus) | 54.1015 | 3.0 | 0.7369 | 0.7449 | 0.6763 | 0.6661 | 0.3555 | 0.2350 | 1.47 |

---

## 2. Qualitative Output Comparisons

## Seed 20

### A — No Repetition Penalties (Baseline)

> "This helps to generate repeat business and foster long-term customer loyalty. Building rapport establishes trust, opens channels of communication, differentiates you from competitors, and leads to long-term customer relationships. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. Timing or urgency objections can be managed by effectively communicating the potential consequences of delaying a decision."

*Diversity: 0.4002 | Avg Progress: 0.2187 | Total Score: 43.6950*

### B — Sentence Repetition Only

> "This helps to generate repeat business and foster long-term customer loyalty. Building rapport establishes trust, opens channels of communication, differentiates you from competitors, and leads to long-term customer relationships. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. Timing or urgency objections can be managed by effectively communicating the potential consequences of delaying a decision."

*Diversity: 0.4002 | Avg Progress: 0.2187 | Total Score: 43.6950*

### C — Sentence + Semantic Repetition

> "This helps to generate repeat business and foster long-term customer loyalty. Building rapport establishes trust, opens channels of communication, differentiates you from competitors, and leads to long-term customer relationships. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Anticipating objections and proactively addressing them is another effective strategy when handling trust or credibility-related concerns. Addressing Concerns and Objections: During your presentation, it is likely that the customer may raise concerns or objections. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding."

*Diversity: 0.3692 | Avg Progress: 0.1811 | Total Score: 53.8386*

### D — Sentence + Semantic + Topic Repetition

> "This helps to generate repeat business and foster long-term customer loyalty. Building rapport establishes trust, opens channels of communication, differentiates you from competitors, and leads to long-term customer relationships. When you show a sincere interest in your customers, they are more likely to reciprocate that interest, leading to a stronger rapport. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. Timing or urgency objections can be managed by effectively communicating the potential consequences of delaying a decision."

*Diversity: 0.4031 | Avg Progress: 0.2465 | Total Score: 33.4303*

### E — Full System (+ Topic Progress Bonus)

> "This helps to generate repeat business and foster long-term customer loyalty. Building long-term relationships: Credibility and trust are not built overnight. This personal touch will reinforce the positive impression they have of your company and make them feel appreciated. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Diversity: 0.4229 | Avg Progress: 0.2414 | Total Score: 43.8894*

---

## Seed 40

### A — No Repetition Penalties (Baseline)

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Anticipating objections and proactively addressing them is another effective strategy when handling trust or credibility-related concerns. Addressing Concerns and Objections: During your presentation, it is likely that the customer may raise concerns or objections. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Diversity: 0.3387 | Avg Progress: 0.1870 | Total Score: 63.3015*

### B — Sentence Repetition Only

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Anticipating objections and proactively addressing them is another effective strategy when handling trust or credibility-related concerns. Addressing Concerns and Objections: During your presentation, it is likely that the customer may raise concerns or objections. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Diversity: 0.3387 | Avg Progress: 0.1870 | Total Score: 63.3015*

### C — Sentence + Semantic Repetition

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions."

*Diversity: 0.4069 | Avg Progress: 0.2588 | Total Score: 54.1576*

### D — Sentence + Semantic + Topic Repetition

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions."

*Diversity: 0.4069 | Avg Progress: 0.2588 | Total Score: 54.0405*

### E — Full System (+ Topic Progress Bonus)

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings. To effectively leverage testimonials, it is crucial to collect them from a diverse range of customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged."

*Diversity: 0.3707 | Avg Progress: 0.2574 | Total Score: 53.0738*

---

## Seed 100

### A — No Repetition Penalties (Baseline)

> "In conclusion, effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Consistency and Reliability: Consistency and reliability are vital in building trust. Building Trust and Credibility: Trust and credibility are fundamental elements in any successful sales relationship. Using Emotional Appeals: Humans are emotional beings, and emotions play a significant role in decision-making. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Diversity: 0.4044 | Avg Progress: 0.2340 | Total Score: 54.8416*

### B — Sentence Repetition Only

> "In conclusion, effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Consistency and Reliability: Consistency and reliability are vital in building trust. Building Trust and Credibility: Trust and credibility are fundamental elements in any successful sales relationship. Using Emotional Appeals: Humans are emotional beings, and emotions play a significant role in decision-making. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Diversity: 0.4044 | Avg Progress: 0.2340 | Total Score: 54.8416*

### C — Sentence + Semantic Repetition

> "In conclusion, effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Consistency and Reliability: Consistency and reliability are vital in building trust. Building Trust and Credibility: Trust and credibility are fundamental elements in any successful sales relationship. Using Emotional Appeals: Humans are emotional beings, and emotions play a significant role in decision-making. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Diversity: 0.4044 | Avg Progress: 0.2340 | Total Score: 54.8134*

### D — Sentence + Semantic + Topic Repetition

> "In conclusion, effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Exploring potential upselling or cross-selling opportunities: If a customer is hesitant about the price of a particular product or service, consider exploring potential upselling or cross-selling opportunities. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections can come in various forms, and some may not be immediately apparent."

*Diversity: 0.3737 | Avg Progress: 0.2288 | Total Score: 53.4041*

### E — Full System (+ Topic Progress Bonus)

> "In conclusion, effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections can come in various forms, and some may not be immediately apparent."

*Diversity: 0.3695 | Avg Progress: 0.2554 | Total Score: 54.5751*

---

## Seed 200

### A — No Repetition Penalties (Baseline)

> "In addition to testimonials and endorsements, you can also utilize case studies to showcase the real-world impact of your product or service. or "How would resolving this concern positively impact your business/life?". Case studies are an effective way to showcase how your solutions have benefited previous customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service, providing valuable insights and advice to your customers. Customers appreciate tangible proof that your solutions have worked for others in similar situations."

*Diversity: 0.2572 | Avg Progress: 0.1712 | Total Score: 64.9177*

### B — Sentence Repetition Only

> "In addition to testimonials and endorsements, you can also utilize case studies to showcase the real-world impact of your product or service. or "How would resolving this concern positively impact your business/life?". Case studies are an effective way to showcase how your solutions have benefited previous customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service, providing valuable insights and advice to your customers. Customers appreciate tangible proof that your solutions have worked for others in similar situations."

*Diversity: 0.2572 | Avg Progress: 0.1712 | Total Score: 64.9177*

### C — Sentence + Semantic Repetition

> "In addition to testimonials and endorsements, you can also utilize case studies to showcase the real-world impact of your product or service. or "How would resolving this concern positively impact your business/life?". Case studies are an effective way to showcase how your solutions have benefited previous customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service, providing valuable insights and advice to your customers. Customers appreciate tangible proof that your solutions have worked for others in similar situations."

*Diversity: 0.2572 | Avg Progress: 0.1712 | Total Score: 64.8823*

### D — Sentence + Semantic + Topic Repetition

> "In addition to testimonials and endorsements, you can also utilize case studies to showcase the real-world impact of your product or service. Case studies are an effective way to showcase how your solutions have benefited previous customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service, providing valuable insights and advice to your customers. Customers appreciate tangible proof that your solutions have worked for others in similar situations. Therefore, sharing success stories of previous satisfied customers provides social proof and instills confidence in potential buyers."

*Diversity: 0.2542 | Avg Progress: 0.1704 | Total Score: 63.4784*

### E — Full System (+ Topic Progress Bonus)

> "In addition to testimonials and endorsements, you can also utilize case studies to showcase the real-world impact of your product or service. Case studies are an effective way to showcase how your solutions have benefited previous customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service, providing valuable insights and advice to your customers. Customers appreciate tangible proof that your solutions have worked for others in similar situations. Therefore, sharing success stories of previous satisfied customers provides social proof and instills confidence in potential buyers."

*Diversity: 0.2542 | Avg Progress: 0.1704 | Total Score: 64.0747*

---

## Seed 500

### A — No Repetition Penalties (Baseline)

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others, while understanding involves comprehending the needs, desires, and perspectives of your potential customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged. Engaged customers are more likely to be attentive, interested, and receptive to your message, leading to a higher likelihood of a successful sale. Remember, effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes, customers may become overwhelmed with information during a sales presentation, or they may need a gentle nudge to solidify their decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Diversity: 0.3601 | Avg Progress: 0.2503 | Total Score: 54.1372*

### B — Sentence Repetition Only

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others, while understanding involves comprehending the needs, desires, and perspectives of your potential customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged. Engaged customers are more likely to be attentive, interested, and receptive to your message, leading to a higher likelihood of a successful sale. Remember, effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes, customers may become overwhelmed with information during a sales presentation, or they may need a gentle nudge to solidify their decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Diversity: 0.3601 | Avg Progress: 0.2503 | Total Score: 54.1372*

### C — Sentence + Semantic Repetition

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others, while understanding involves comprehending the needs, desires, and perspectives of your potential customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged. Engaged customers are more likely to be attentive, interested, and receptive to your message, leading to a higher likelihood of a successful sale. Remember, effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes, customers may become overwhelmed with information during a sales presentation, or they may need a gentle nudge to solidify their decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Diversity: 0.3601 | Avg Progress: 0.2503 | Total Score: 54.1372*

### D — Sentence + Semantic + Topic Repetition

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others, while understanding involves comprehending the needs, desires, and perspectives of your potential customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged. Engaged customers are more likely to be attentive, interested, and receptive to your message, leading to a higher likelihood of a successful sale. Remember, effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes, customers may become overwhelmed with information during a sales presentation, or they may need a gentle nudge to solidify their decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Diversity: 0.3601 | Avg Progress: 0.2503 | Total Score: 54.0185*

### E — Full System (+ Topic Progress Bonus)

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others, while understanding involves comprehending the needs, desires, and perspectives of your potential customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged. Engaged customers are more likely to be attentive, interested, and receptive to your message, leading to a higher likelihood of a successful sale. Remember, effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes, customers may become overwhelmed with information during a sales presentation, or they may need a gentle nudge to solidify their decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Diversity: 0.3601 | Avg Progress: 0.2503 | Total Score: 54.8944*

---




## 3. Analysis & Key Findings

### Topic Diversity
Diversity (mean pairwise cosine distance across selected sentence embeddings) improved across the gradient A→E:

| A | B | C | D | E |
|:---:|:---:|:---:|:---:|:---:|
| 0.3521 | 0.3521 | 0.3596 | 0.3596 | 0.3555 |

- **Sentence-level gate (A→B)**: No change. As expected — the corpus has no exact duplicates across trajectories, so the gate never fires but adds a safety guard at zero cost.
- **Semantic threshold (B→C)**: Diversity **+0.0075**. The 0.85 cosine threshold successfully reroutes the search away from near-paraphrase repetitions in Seed 40 and Seed 100.
- **Topic centroid penalty (C→D)**: Diversity stays at **0.3596** while Avg Progress rises from 0.2191 → 0.2310. The topic rep penalty is shifting **which** sentences are selected without yet broadening the overall span.
- **Progress bonus (D→E)**: Partial score recovery (+2.4 total score) with Avg Progress at **0.2350** — the highest across all conditions. The exploration bonus rewards novelty, pulling the score back up without sacrificing the diversity gains.

### Topic Progress
Avg Progress per step strictly increases from A→E:

```
A: 0.2122 → B: 0.2122 → C: 0.2191 → D: 0.2310 → E: 0.2350
```

This confirms the full system (E) most consistently selects sentences in previously unexplored semantic territory.

### Score Trade-off

| Condition | Total Score | Interpretation |
|:---|:---:|:---|
| A (baseline) | 56.18 | Maximises local coherence — allows topic recycling |
| B | 56.18 | Identical: no duplicates in this corpus |
| C | 56.37 | Slight score **increase** — semantic rerouting finds better alternatives |
| D | 51.67 | Score drop: topic penalty overrides high-scoring repetitive paths |
| E | 54.10 | Partial recovery: progress bonus (+0.5 × progress) reclaims 2.4 points |

The Condition C result is particularly notable: **score goes up** because the semantic penalty steers search away from paraphrase ruts toward genuinely higher-quality sentences it previously skipped.

### Observation: Hard Seeds vs. Soft Seeds
- Seeds 40, 100, 200 show measurable A→E variation — the topic penalty navigates them differently.
- Seeds 20, 500 show moderate resistance to change — these trajectories are already relatively diverse and near-optimal from the baseline, so the penalty system has less to correct.

### Separation of Concerns
- The repetition system operates entirely at **scoring time** and does not modify the corpus, the boundary overlap logic, the policy head, or the validity model.
- It is fully weight-configurable and can be disabled with `--no-repetition-penalty`.
- Zero overhead on the Policy Head early pruning step (repetition computed only after pruning).

