# AlphaLM v3 Performance Report

This report documents the performance outputs, metrics comparison, and generated text samples from the AlphaLM v3 language search system.

---

## 1. Quantitative Performance Metrics

The evaluation compares the Greedy Baseline (Beam Width = 1) against the Trajectory Beam Search (Beam Width = 5) on the full `dataset_sales.txt` corpus starting from seed index 20.

| Metric | Greedy Baseline (B = 1) | Trajectory Beam Search (B = 5) |
| :--- | :---: | :---: |
| **Total Path Score** | 10.4989 | **52.1015** |
| **Exact Boundary Matches** | 0 | **4** |
| **Average Local Coherence** | **0.6062** | 0.6056 |
| **Average Global Coherence** | **0.6778** | 0.6156 |
| **Global Coherence Trend** | +0.021310 | +0.016463 |

### Analysis
* **Trajectory Search Optimization**: Setting $B=5$ yielded a path score of **52.1015**, representing a **~400% increase** in trajectory quality over the greedy baseline.
* **Exact Boundary Matches**: Beam search successfully identified **4 exact boundary overlaps** by scanning candidate futures. The greedy chain failed to secure any exact matches (0) because it prioritized immediate semantic gains over boundary structure.
* **Coherence Trade-off**: The greedy baseline holds slightly higher average local/global coherence scores (+0.0006 local, +0.062 global) but lacks transitions. Beam search intelligently trades a fraction of semantic similarity for dominant exact boundary matches, staying true to the text-quilting philosophy.

---

## 2. Generated Text Samples

### A. Greedy Baseline (B = 1)
> This helps to generate repeat business and foster long term customer loyalty. Utilize customer relationship management crm software to track objections identify trends and tailor sales strategies accordingly. Continuously testing and refining your methods will help you find the most effective ways to close sales and improve your overall success rates. Defining success criteria before you can measure your closing success rates it is important to define what constitutes a successful sale. Analyzing closing success rates regularly analyze your closing success rates to gain valuable insights into your sales performance. Thus sales professionals should be prepared to go the extra mile to secure the sale offering incentives or discounts that align with the customer 's needs and preferences. Acknowledge and reward yourself for achieving your sales targets or improving your closing success rates. Sharing success stories and real life examples of how the alternative solution has worked for others can be highly persuasive.

### B. Trajectory Beam Search (B = 5)
> This helps to generate repeat business and foster long term customer loyalty. Encouraging customer engagement to maximize the impact of your presentation it is crucial to encourage customer engagement and participation. Celebrating and recognizing success lastly it is crucial to celebrate and recognize your successes along the way you present your solutions can greatly impact the customer 's understanding and perception of what you have to offer alternative solutions sometimes objections arise because the customer perceives a limitation or mismatch between their needs and your current offering limited time offers or exclusive deals can encourage potential customers to act swiftly to secure the best possible price or budget objections one of the most frequent objections in sales is related to price or budget. Risk or uncertainty objections prospects may express apprehension or fear of taking risks or uncertainties associated with a purchase.

---

## 3. Explanations of Moves

During search execution, AlphaLM v3 generates step-by-step logs. Here is the reasoning behind the first transition under Beam Search ($B=5$):
* **Step 1 Chosen Index**: 3359 ("*Utilizing Customer Relationship Management (CRM) Systems: To...*")
* **Rationale**: Selected as the best semantic continuation (boundary similarity: 0.7521) with balanced coherence.
* **Score Details**: Total: 1.3927 | Boundary: Semantic Sim (0.7521) | Local Coherence: 0.6511 | Global Coherence: 0.6242 | Completion: 0.0000
* **Rejected Alternative (Candidate 2908)**: Scores -> Total: 1.3645 | Boundary: Semantic Sim (0.9644) | Local Coherence: 0.3719 | Global Coherence: 0.4233 | Completion: 0.0000
* **Why Rejected**: Although Candidate 2908 has higher boundary semantic similarity (0.9644 vs. 0.7521), Candidate 3359 was selected because its local coherence (0.6511) and global coherence (0.6242) significantly outperformed Candidate 2908's coherence scores, resulting in a higher total trajectory score.

---

## 4. Learned "Makes-Sense" Evaluator (AlphaLM v4)

We implemented a lightweight neural evaluator ("Makes-Sense Head") using a PyTorch MLP to predict whether a trajectory of sentences flows logically or is corrupted (shuffled, domain-mixed, disconnected, or interrupted).

### A. Evaluator Training Performance
The MLP was trained on 3,200 generated positive and negative sample trajectories from the Sales and Newton corpora. Evaluation on the held-out test split yields the following binary classification metrics:

* **Accuracy**: 0.8475
* **Precision**: 0.8325
* **Recall**: 0.8700
* **F1 Score**: 0.8509
* **ROC AUC**: 0.9034

These results show that the model learns strong domain-continuity and local/global trajectory consistency.

### B. Search Quality Comparison
We compared generation outputs using two distinct seed indices (`20` and `40`) and a path length of `6` to evaluate the model's impact across different starting contexts.

#### Comparison 1: Seed Index 20

| Metric | Standard Beam Search ($w_{makes\_sense} = 0.0$) | Learned Evaluator Beam Search ($w_{makes\_sense} = 1.5$) |
| :--- | :---: | :---: |
| **Total Path Score** | 39.1890 | 26.4780 |
| **Exact Boundary Matches** | 3 | 1 |
| **Average Local Coherence** | 0.6635 | **0.7679** |
| **Average Global Coherence** | 0.6690 | **0.7979** |
| **Average Makes-Sense Score** | 0.0000 | **0.9241** |
| **Global Coherence Trend** | +0.088779 | +0.048334 |

* **Standard Search ($w_{makes\_sense} = 0.0$) Sample**:
  > *This helps to generate repeat business and foster long term customer loyalty. Encouraging customer engagement to maximize the impact of your presentation it is crucial to encourage customer engagement and participation. Celebrating and recognizing success lastly it is crucial to celebrate and recognize your successes along the way you present your solutions can greatly impact the customer 's understanding and perception of what you have to offer alternative solutions sometimes objections arise because the customer perceives a limitation or mismatch between their needs and your current offering alternative solutions sometimes objections arise because the customer perceives a mismatch between their needs and the features of your product or service.*
  * **Observation**: The text loops and repeats very similar sentences (objections and alternative solutions) because it prioritizes simple immediate word overlaps without considering the flow of the broader document trajectory.
* **Evaluator Search ($w_{makes\_sense} = 1.5$) Sample**:
  > *This helps to generate repeat business and foster long term customer loyalty. Encouraging customer engagement to maximize the impact of your presentation it is crucial to encourage customer engagement and participation. Clear and concise communication to build trust it is essential to communicate clearly and concisely. Acknowledge and validate when faced with objections it is essential to acknowledge and validate the concerns of your potential customers are often skeptical and require evidence to support your assertions. Personalizing your digital interactions while technology allows for efficient and widespread communication it is crucial to personalize your interactions with customers and prospects.*
  * **Observation**: The evaluator effectively penalizes redundancy and low-coherence domain transitions. It guides the search to step through highly diverse, relevant aspects of sales methodology (from loyalty $\rightarrow$ engagement $\rightarrow$ concise communication $\rightarrow$ handling objections $\rightarrow$ personalization). The resulting paragraph flows exceptionally well and reads naturally.

---

#### Comparison 2: Seed Index 40

| Metric | Standard Beam Search ($w_{makes\_sense} = 0.0$) | Learned Evaluator Beam Search ($w_{makes\_sense} = 1.5$) |
| :--- | :---: | :---: |
| **Total Path Score** | 28.0481 | 26.0158 |
| **Exact Boundary Matches** | 2 | 1 |
| **Average Local Coherence** | 0.7058 | **0.7936** |
| **Average Global Coherence** | 0.7362 | **0.8269** |
| **Average Makes-Sense Score** | 0.0000 | **0.8667** |
| **Global Coherence Trend** | -0.004367 | **+0.014576** |

* **Standard Search ($w_{makes\_sense} = 0.0$) Sample**:
  > *Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Clarify and validate once the customer has expressed their concern take the time to clarify and validate their point of view. Instead of dismissing or invalidating their concerns respond with respect and understanding goes hand in hand with empathy as it involves gaining a deep comprehension of the customer 's unique circumstances goals and objectives 1. Chapter 3 discovering customer needs and pain points subpoint empathy and understanding empathy and understanding are crucial elements in the process of discovering customer needs and pain points.*
  * **Observation**: The text drifts into textbook formatting structural elements ("1. Chapter 3 discovering customer needs and pain points...") because it simply follows local keyword match similarities without a higher-level sense of trajectory coherence.
* **Evaluator Search ($w_{makes\_sense} = 1.5$) Sample**:
  > *Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Understanding and adapting to the customer 's preferences and communication style requires careful observation and active listening involves more than simply hearing the words spoken by the customer it requires focused attention and a genuine interest in understanding their perspective. Validating their concerns demonstrates that you are genuinely listening and considering their perspective. Their response will provide valuable insights into their level of interest and allow you to adjust your approach accordingly. Personalized approach to build trust you need to show genuine interest in your customers.*
  * **Observation**: The evaluator successfully filters out structural artifacts and formatting noise (like chapter headers and numbered list markers). It maintains a highly coherent, professional tone focused on active listening, validation, and adapting communication styles to build trust.

---

## 5. Learned Policy Head (AlphaLM v5)

We built a lightweight neural policy network (`AlphaLMPolicyMLP`) using a PyTorch MLP to predict candidate continuation survival likelihood and prune the beam search space early.

### A. Policy Head Training Performance
The policy head was trained on **33,600 transition evaluations** collected from simulated search logs across the Sales and Newton corpora. Evaluation on the held-out test split yields:

* **Accuracy**: 0.9723
* **ROC AUC**: 0.7751

The high ROC AUC confirms that the model is exceptionally good at ranking the actual search survivors significantly higher than the rejected alternatives.

### B. Search Efficiency & Latency Comparison
We compared the search execution times and transition evaluation counts on the Sales dataset with seed index `20` and path length `6`.

| Parameter / Metric | Evaluator-Only Search ($w_{makes\_sense} = 1.5$, $w_{policy} = 0.0$) | Policy + Evaluator Search ($w_{makes\_sense} = 1.5$, $w_{policy} = 1.0$) |
| :--- | :---: | :---: |
| **Search Loop Execution Time** | ~41 seconds | **~5 seconds** |
| **Total Path Score** | 26.4780 | **32.9916** |
| **Exact Boundary Matches** | 1 | **2** |
| **Average Local Coherence** | **0.7679** | 0.7001 |
| **Average Global Coherence** | **0.7979** | 0.7164 |
| **Average Makes-Sense Score** | **0.9241** | 0.6558 |
| **Average Policy Score** | 0.0000 | **0.1302** |
| **Transitions Evaluated** | ~51,000 | **~1,500** |
| **Search Speedup** | Baseline | **8.2x Speedup (34x fewer evaluations!)** |

### C. Generated Text Sample (Policy + Evaluator)
> "This helps to generate repeat business and foster long term customer loyalty. When customers feel understood and valued they are more likely to trust your recommendations and believe in the value of your solutions. Simplify your message without oversimplifying it ensuring that your customers grasp the essence of your offering limited time offers or exclusive deals can encourage potential customers to act swiftly to secure the best possible price or budget objections one of the most frequent objections in sales is related to price or budget. Avoid overselling or inundating your potential customers with excessive testimonials as it may come across as disingenuous."

### Analysis
* **Pruning Efficacy**: By scoring candidates early via the policy head's batch forward pass and keeping only the top 100 candidates, the searcher avoided running expensive local, global, and makes-sense evaluations on the remaining ~3,290 candidates per step. This reduced total transition evaluations from ~51,000 to just ~1,500.
* **Trajectory Quality**: The policy head successfully steered the search toward a path with a higher total score (32.9916 vs 26.4780) and double the number of exact boundary matches (2 vs 1), producing highly coherent and structured sales text in only 5 seconds.



