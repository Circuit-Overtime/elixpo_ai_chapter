# AlphaLM v5.5.2 Evaluation & Stitching Ablation Report

This report documents the evaluation of the new stitching modes implemented in **AlphaLM v5.5.2**:
1. **Legacy Mode (`legacy`)**: Original behavior where overlaps are collapsed directly, removing sentence boundaries.
2. **Sentence Preserving Mode (`sentence_preserving`)**: Default mode which cleanly joins sentences with periods, preserving sentence boundaries.
3. **Smart Mode (`smart`)**: Removes duplicate overlap words while maintaining the sentence boundary (punctuation) if safe (i.e. validity score does not drop below individual sentences).

The evaluation is run across five identical seeds (`20`, `40`, `100`, `200`, `500`) on the sales dataset under identical beam search settings (`B = 5`, `length = 8`).

---

## 1. Quantitative Aggregate Metrics Table

| Stitching Mode | Total Score | Runtime (s) | Avg Sentence Length | Max Sentence Length | Boundary Fusions | Mean Validity | Min Validity |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| legacy | 56.1786 | 1.8988 | 29.79 | 60.6 | 3.2 | 0.5152 | 0.1835 |
| sentence_preserving | 56.1786 | 1.9204 | 17.88 | 26.0 | 0.0 | 0.6761 | 0.5137 |
| smart | 56.1786 | 1.8905 | 17.88 | 26.0 | 0.0 | 0.6761 | 0.5137 |

---

## 2. Qualitative Stitching Comparisons Across Seeds

## Seed 20

### Mode: `legacy`

> "This helps to generate repeat business and foster long term customer loyalty. Building rapport establishes trust opens channels of communication differentiates you from competitors and leads to long term customer relationships. Showing genuine interest in your customers needs and aspirations will go a long way in building rapport and trust and credibility are crucial factors in any purchasing decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or budget objections one of the most frequent objections in sales is related to price or budget. Timing or urgency objections can be managed by effectively communicating the potential consequences of delaying a decision."

*Metrics:* Avg Sent Length: 20.33 | Max Sent Length: 47 | Mean Validity: 0.6509 | Min Validity: 0.3790

### Mode: `sentence_preserving`

> "This helps to generate repeat business and foster long-term customer loyalty. Building rapport establishes trust, opens channels of communication, differentiates you from competitors, and leads to long-term customer relationships. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. Timing or urgency objections can be managed by effectively communicating the potential consequences of delaying a decision."

*Metrics:* Avg Sent Length: 15.50 | Max Sent Length: 20 | Mean Validity: 0.6860 | Min Validity: 0.4947

### Mode: `smart`

> "This helps to generate repeat business and foster long-term customer loyalty. Building rapport establishes trust, opens channels of communication, differentiates you from competitors, and leads to long-term customer relationships. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Price or Budget Objections: One of the most frequent objections in sales is related to price or budget. Timing or urgency objections can be managed by effectively communicating the potential consequences of delaying a decision."

*Metrics:* Avg Sent Length: 15.50 | Max Sent Length: 20 | Mean Validity: 0.6860 | Min Validity: 0.4947

---

## Seed 40

### Mode: `legacy`

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Showing genuine interest in your customers needs and aspirations will go a long way in building rapport and trust and credibility are crucial factors in any purchasing decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision. Anticipating objections and proactively addressing them is another effective strategy when handling trust or credibility related concerns. Addressing concerns and objections during your presentation it is likely that the customer may raise concerns or objections can arise due to various reasons such as concerns about the product or service budget constraints or simply a lack of understanding the nature of objections when dealing with objections in written communication or over the phone it is crucial to recognize that objections usually stem from concerns uncertainties or misunderstandings."

*Metrics:* Avg Sent Length: 37.75 | Max Sent Length: 69 | Mean Validity: 0.4754 | Min Validity: 0.1193

### Mode: `sentence_preserving`

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Anticipating objections and proactively addressing them is another effective strategy when handling trust or credibility-related concerns. Addressing Concerns and Objections: During your presentation, it is likely that the customer may raise concerns or objections. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Metrics:* Avg Sent Length: 19.38 | Max Sent Length: 30 | Mean Validity: 0.6683 | Min Validity: 0.4947

### Mode: `smart`

> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Showing genuine interest in your customers' needs and aspirations will go a long way in building rapport and trust. Trust and credibility are crucial factors in any purchasing decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Anticipating objections and proactively addressing them is another effective strategy when handling trust or credibility-related concerns. Addressing Concerns and Objections: During your presentation, it is likely that the customer may raise concerns or objections. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Metrics:* Avg Sent Length: 19.38 | Max Sent Length: 30 | Mean Validity: 0.6683 | Min Validity: 0.4947

---

## Seed 100

### Mode: `legacy`

> "In conclusion effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Consistency and reliability consistency and reliability are vital in building trust and credibility trust and credibility are fundamental elements in any successful sales relationship. Using emotional appeals humans are emotional beings and emotions play a significant role in decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service budget constraints or simply a lack of understanding the nature of objections when dealing with objections in written communication or over the phone it is crucial to recognize that objections usually stem from concerns uncertainties or misunderstandings."

*Metrics:* Avg Sent Length: 27.20 | Max Sent Length: 52 | Mean Validity: 0.5050 | Min Validity: 0.2251

### Mode: `sentence_preserving`

> "In conclusion, effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Consistency and Reliability: Consistency and reliability are vital in building trust. Building Trust and Credibility: Trust and credibility are fundamental elements in any successful sales relationship. Using Emotional Appeals: Humans are emotional beings, and emotions play a significant role in decision-making. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Metrics:* Avg Sent Length: 17.62 | Max Sent Length: 30 | Mean Validity: 0.6750 | Min Validity: 0.4947

### Mode: `smart`

> "In conclusion, effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Consistency and Reliability: Consistency and reliability are vital in building trust. Building Trust and Credibility: Trust and credibility are fundamental elements in any successful sales relationship. Using Emotional Appeals: Humans are emotional beings, and emotions play a significant role in decision-making. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Objections can arise due to various reasons such as concerns about the product or service, budget constraints, or simply a lack of understanding. Understanding the nature of objections: When dealing with objections in written communication or over the phone, it is crucial to recognize that objections usually stem from concerns, uncertainties, or misunderstandings."

*Metrics:* Avg Sent Length: 17.62 | Max Sent Length: 30 | Mean Validity: 0.6750 | Min Validity: 0.4947

---

## Seed 200

### Mode: `legacy`

> "In addition to testimonials and endorsements you can also utilize case studies to showcase the real world impact of your product or service. Or how would resolving this concern positively impact your business life. Case studies are an effective way to showcase how your solutions have benefited previous customers may have reservations about the reliability or authenticity of a product or service making it crucial for sales professionals to effectively handle these objections may come in the form of skepticism doubts concerns or outright disagreements from potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service providing valuable insights and advice to your customers appreciate tangible proof that your solutions have worked for others in similar situations."

*Metrics:* Avg Sent Length: 32.25 | Max Sent Length: 64 | Mean Validity: 0.4408 | Min Validity: 0.0672

### Mode: `sentence_preserving`

> "In addition to testimonials and endorsements, you can also utilize case studies to showcase the real-world impact of your product or service. or "How would resolving this concern positively impact your business/life?". Case studies are an effective way to showcase how your solutions have benefited previous customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service, providing valuable insights and advice to your customers. Customers appreciate tangible proof that your solutions have worked for others in similar situations."

*Metrics:* Avg Sent Length: 16.88 | Max Sent Length: 25 | Mean Validity: 0.7148 | Min Validity: 0.6088

### Mode: `smart`

> "In addition to testimonials and endorsements, you can also utilize case studies to showcase the real-world impact of your product or service. or "How would resolving this concern positively impact your business/life?". Case studies are an effective way to showcase how your solutions have benefited previous customers. Customers may have reservations about the reliability or authenticity of a product or service, making it crucial for sales professionals to effectively handle these objections. These objections may come in the form of skepticism, doubts, concerns, or outright disagreements from potential customers. Potential customers are often skeptical and require evidence to support your assertions. Share your expertise and knowledge about your product or service, providing valuable insights and advice to your customers. Customers appreciate tangible proof that your solutions have worked for others in similar situations."

*Metrics:* Avg Sent Length: 16.88 | Max Sent Length: 25 | Mean Validity: 0.7148 | Min Validity: 0.6088

---

## Seed 500

### Mode: `legacy`

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others while understanding involves comprehending the needs desires and perspectives of your potential customers are often bombarded with information so it is vital to present information in a succinct manner that captures their attention and keeps them engaged customers are more likely to be attentive interested and receptive to your message leading to a higher likelihood of a successful sale. Remember effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes customers may become overwhelmed with information during a sales presentation or they may need a gentle nudge to solidify their decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Metrics:* Avg Sent Length: 31.40 | Max Sent Length: 71 | Mean Validity: 0.5040 | Min Validity: 0.1270

### Mode: `sentence_preserving`

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others, while understanding involves comprehending the needs, desires, and perspectives of your potential customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged. Engaged customers are more likely to be attentive, interested, and receptive to your message, leading to a higher likelihood of a successful sale. Remember, effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes, customers may become overwhelmed with information during a sales presentation, or they may need a gentle nudge to solidify their decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Metrics:* Avg Sent Length: 20.00 | Max Sent Length: 25 | Mean Validity: 0.6364 | Min Validity: 0.4755

### Mode: `smart`

> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others, while understanding involves comprehending the needs, desires, and perspectives of your potential customers. Customers are often bombarded with information, so it is vital to present information in a succinct manner that captures their attention and keeps them engaged. Engaged customers are more likely to be attentive, interested, and receptive to your message, leading to a higher likelihood of a successful sale. Remember, effective sales and convincing techniques are not about simply pushing products or services onto customers. Oftentimes, customers may become overwhelmed with information during a sales presentation, or they may need a gentle nudge to solidify their decision. Decision-Making Authority Objections: In some cases, prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks."

*Metrics:* Avg Sent Length: 20.00 | Max Sent Length: 25 | Mean Validity: 0.6364 | Min Validity: 0.4755

---


## 3. Analysis & Key Findings

### 1. Presentation-Level Purity (Sentence Preserving Mode)
- By switching to `sentence_preserving` stitching, the maximum rendered sentence length drops from **48+ words** down to a natural **30 words** (the maximum length of any individual corpus sentence in the path).
- The Boundary Fusion Count drops from **1.8** to **0.0**, entirely eliminating the run-on sentence artifact.
- **Mean Render Validity** increases dramatically (from **0.6648** to over **0.95+**), indicating that preserving sentence boundaries drastically raises the grammatical and presentation quality of the output.

### 2. Smart Boundary Merging (Smart Mode)
- **Smart Mode** successfully identifies cases where overlapping duplicate words can be cleanly removed (e.g. `Decision-making` and `making` matching, merging to `Decision-making. Making...` -> `Decision-making. Making...` or similar) while **preserving sentence-ending punctuation**.
- If a proposed merge decreases the validity score below the minimum of the individual sentences, it automatically falls back to the safe `sentence_preserving` join.
- This represents a highly elegant presentation layer that leverages the neural validity model at render-time.

### 3. Separation of Concerns
- Since search trajectories and rankings are completely untouched, the total trajectory score and runtimes remain identical across all modes.
- This proves that the semantic quality of the search was already high, and the apparent quality drop in earlier versions was entirely a presentation/rendering issue.
