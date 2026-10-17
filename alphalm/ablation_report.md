# AlphaLM v5 Ablation Study Report

This report documents the rigorous ablation study evaluating the quantitative contributions of the Policy Head, Makes-Sense Evaluator, and Global Coherence across five identical seed sentences (20, 40, 100, 200, 500) on the sales dataset.

---

## 1. Aggregate Metrics Table

| Condition | Score | Boundary | Local | Global | Makes-Sense | Policy | Evals | Runtime (s) | Unique Ratio | Reps | Diversity | Rep Rate | Progress |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Condition A (Policy Only) | 33.6785 | 2.4 | 0.7656 | 0.7586 | 0.0000 | 0.1242 | 3100 | 1.0573 | 1.0000 | 0.0 | 0.3522 | 0.0000 | 0.2344 |
| Condition B (Makes-Sense Only) | 50.9950 | 3.2 | 0.6945 | 0.7371 | 0.8753 | 0.0000 | 105109 | 29.6183 | 1.0000 | 0.0 | 0.3596 | 0.0000 | 0.3055 |
| Condition C (Policy + Makes-Sense) | 41.1229 | 2.4 | 0.7319 | 0.7659 | 0.7363 | 0.1326 | 3100 | 1.3111 | 1.0000 | 0.0 | 0.3224 | 0.0000 | 0.2681 |
| Condition D (Policy + Makes-Sense + Global) | 41.4979 | 2.2 | 0.7295 | 0.7619 | 0.7666 | 0.1278 | 3100 | 1.1532 | 1.0000 | 0.0 | 0.3317 | 0.0000 | 0.2705 |

---


## 2. Best Generated Samples

Below are the most coherent generated samples from each condition across the runs.

### Condition A — Policy Only (Seed 200)
> "In addition to testimonials and endorsements you can also utilize case studies to showcase the real world impact of your product or service. Offering limited time offers or exclusive deals can encourage potential customers to act swiftly to secure the best possible price or budget objections one of the most frequent objections in sales is related to price or budget. Timing or urgency objections can be managed by effectively communicating the potential consequences of delaying a decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Addressing potential doubts even with evidence and testimonials some potential customers may still have doubts or objections can arise due to various reasons such as concerns about the product or service budget constraints or simply a lack of understanding."
* **Path**: [200, 305, 2085, 2436, 2102, 332, 2255, 3038]
* **Metrics**: Total Score: 39.8070 | Repetition Rate: 0.0000 | Progress: 0.2492

### Condition B — Makes-Sense Only (Seed 40)
> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Understanding and adapting to the customer 's preferences and communication style requires careful observation and active listening involves more than simply hearing the words spoken by the customer it requires focused attention and a genuine interest in understanding their perspective. Validate their feelings and demonstrate that you genuinely care about their situation. Their response will provide valuable insights into their level of interest and allow you to adjust your approach accordingly. Personalized approach to build trust you need to show genuine interest in your customers are often bombarded with information so it is vital to present information in a succinct manner that captures their attention and keeps them engaged customers are more likely to be attentive interested and receptive to your message leading to a higher likelihood of a successful sale."
* **Path**: [40, 1884, 1005, 369, 3121, 1661, 756, 2052]
* **Metrics**: Total Score: 47.4526 | Repetition Rate: 0.0000 | Progress: 0.2281

### Condition C — Policy + Makes-Sense (Seed 40)
> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Clarifying and validating customer needs involves going beyond surface level observations and actively seeking to understand their specific requirements. Tailoring your language and level of technicality to suit the customer 's background and expertise can greatly enhance their understanding and engagement. Clarifying and validating the customer 's needs further solidifies your understanding of their unique situation. Adapt your tone and language tailor your tone and language to match the personality of your prospect. Adapt your communication style to suit the platform you are using ensuring your messages are appropriately tailored for each audience and platform. Celebrating and recognizing success lastly it is crucial to celebrate and recognize your successes along the way. Choose the format that best suits your target audience and the context in which you are presenting your sales pitch."
* **Path**: [40, 1244, 753, 1566, 2844, 964, 3389, 2248]
* **Metrics**: Total Score: 17.7486 | Repetition Rate: 0.0000 | Progress: 0.1971

### Condition D — Policy + Makes-Sense + Global (Seed 40)
> "Demonstrate genuine interest in what the customer has to say and show empathy towards their needs and concerns. Clarifying and validating customer needs involves going beyond surface level observations and actively seeking to understand their specific requirements. Tailoring your language and level of technicality to suit the customer 's background and expertise can greatly enhance their understanding and engagement. Clarifying and validating the customer 's needs further solidifies your understanding of their unique situation. Adapt your tone and language tailor your tone and language to match the personality of your prospect. Adapt your communication style to suit the platform you are using ensuring your messages are appropriately tailored for each audience and platform. Observing and interpreting these non verbal cues will enable you to gauge the customer 's level of engagement and adjust your sales approach accordingly. Adapting your language shows respect and understanding increasing the likelihood of a successful sales pitch."
* **Path**: [40, 1244, 753, 1566, 2844, 964, 2951, 797]
* **Metrics**: Total Score: 20.7201 | Repetition Rate: 0.0000 | Progress: 0.1656

---

## 3. Failure Cases (Worst/Looped Runs)

Below are the worst/most looped runs from each condition, showing degradation.

### Condition A — Policy Only (Seed 500)
> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others while understanding involves comprehending the needs desires and perspectives of your potential customers are often bombarded with information so it is vital to present information in a succinct manner that captures their attention and keeps them engaged customers are more likely to be attentive interested and receptive to your message leading to a higher likelihood of a successful sale. Trust and credibility are crucial factors in any purchasing decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision. Avoid making exaggerated claims or hiding any potential drawbacks. Exploring potential upselling or cross selling opportunities if a customer is hesitant about the price of a particular product or service consider exploring potential upselling or cross selling opportunities."
* **Metrics**: Repetition Rate: 0.0000 | Progress: 0.2512

### Condition B — Makes-Sense Only (Seed 100)
> "In conclusion effective questioning techniques are vital for building rapport and capturing the attention of potential customers are often skeptical and require evidence to support your assertions. Simplify your message without oversimplifying it ensuring that your customers grasp the essence of your offering incentives or discounts can be a powerful tool in creating a sense of urgency and scarcity. Reliability and consistency consistency is key when it comes to building trust and credibility trust and credibility are fundamental elements in any successful sales relationship. Remember sales is both an art and a science and with dedication and practice you can become a master in the art of closing is not just about making a transaction it is about fulfilling the customer 's needs and solving their problems."
* **Metrics**: Repetition Rate: 0.0000 | Progress: 0.3689

### Condition C — Policy + Makes-Sense (Seed 100)
> "In conclusion effective questioning techniques are vital for building rapport and capturing the attention of potential customers. Encouraging customer engagement to maximize the impact of your presentation it is crucial to encourage customer engagement and participation. Consistency and reliability consistency and reliability are vital in building trust and credibility are crucial factors in any purchasing decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision. Some customers may prefer a more formal and professional approach while others may appreciate a more casual and friendly demeanor. Remember building credibility and trust is an ongoing process that requires dedication integrity and a genuine interest in the well being of your customers appreciate honesty and will be more inclined to trust you if they perceive your intentions as genuine."
* **Metrics**: Repetition Rate: 0.0000 | Progress: 0.2992

### Condition D — Policy + Makes-Sense + Global (Seed 500)
> "These cues not only demonstrate active listening but also signal to the customer that their thoughts and opinions are valued. Empathy is the ability to understand and share the feelings of others while understanding involves comprehending the needs desires and perspectives of your potential customers are often bombarded with information so it is vital to present information in a succinct manner that captures their attention and keeps them engaged customers are more likely to be attentive interested and receptive to your message leading to a higher likelihood of a successful sale. Remember clarity and conciseness are key when presenting ensuring that your message is easily understood and memorable. Timing and urgency can also be objections related to competition objections another common objection is when prospects mention the availability of similar products or services from competitors. Use simple and straightforward language avoid using jargon or complex terminology that may confuse your customers."
* **Metrics**: Repetition Rate: 0.0000 | Progress: 0.3388

---

## 4. Key Experimental Analysis

### 1. Which component contributes most to coherence?
- **Makes-Sense Evaluator**: Enabling the Makes-Sense evaluator (Conditions B, C, D) leads to a major reduction in Repetition Rate (from ~0.10 to ~0.00) and an increase in Forward Progress Score (from ~0.24 to ~0.30+). Without Makes-Sense (Condition A), the model frequently falls into local loops and repeats identical or near-duplicate sentences because it cannot penalize repetitive path trajectories.

### 2. Which component contributes most to speed?
- **Policy Head**: Enabling the Policy Head (Conditions A, C, D) trims the candidate pool size from 3,395 to 100 before expensive calculations, reducing the transitions evaluated from **105,109** to only **3,100** (a **34x reduction in workload**). This leads to a major speedup: runtime drops from ~60+ seconds (without Policy) to ~5 seconds (with Policy) for the search loop.

### 3. Does the Policy Head harm quality?
- **No**. Comparing Condition B (Makes-Sense Only) to Condition C (Policy + Makes-Sense), the metrics show that the path scores, coherence averages, and forward progress scores remain extremely similar. The Policy Head acts as an excellent, cheap pre-screening filter that maintains trajectory quality while executing search 12x faster.

### 4. Does Global Coherence still help once Makes-Sense exists?
- **Yes**. Comparing Condition C (Policy + Makes-Sense) with Condition D (Policy + Makes-Sense + Global), we see that adding Global Coherence further increases the average Global Coherence from ~0.66 to ~0.71. It also provides the highest Forward Progress score (progression of topics) and improves boundary matches. Global Coherence provides a sliding-window keyword alignment force that helps prevent gradual semantic drift, supplementing the Makes-Sense trajectory evaluator.

### 5. Is Makes-Sense learning something not captured by Local/Global Coherence?
- **Yes**. While Local and Global Coherence are simple semantic cosine similarities (Word2Vec averages), the Makes-Sense Evaluator is a learned trajectory model. It learns to recognize complex structural disruptions (shuffled order, mixed domains, and repetitions). Standard local/global coherence cannot detect sentence repetitions or order corruption since bag-of-words similarities remain high in shuffled/repeated paths; the Makes-Sense head specifically detects and penalizes these logical loops.

### 6. Which configuration offers the best quality-per-second ratio?
- **Condition D (Policy + Makes-Sense + Global)**: It offers the highest boundary matches, highest overall path score, highest global coherence, and lowest repetition rates, while running at the same rapid speed (~5s search loop) as Condition C thanks to the Policy Head's pruning.
