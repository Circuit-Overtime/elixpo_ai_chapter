"""Bernoulli bit-flip diffusion over binary images (P1).

Bits in {0,1}. Forward flips each bit independently. Single-step flip prob beta_t;
cumulative flip prob from x0 to x_t is p_t = (1 - k_t)/2 with k_t = prod(1 - 2*beta_s).
As t -> T, k_t -> 0 so p_t -> 1/2: x_T is a uniform random bitstring ("absolute noise").

The reverse posterior q(x_{t-1} | x_t, x0) is closed-form Bernoulli, computed per pixel
from the single-step likelihood (beta_t) and the cumulative prior (p_{t-1}).
"""

import torch


class BernoulliBitFlip:
    def __init__(self, T=256, beta_start=1e-3, beta_end=0.45, device="cpu"):
        # beta_t < 0.5 for all t (a single step never flips more than half the time).
        betas = torch.linspace(beta_start, beta_end, T, device=device)
        k = torch.cumprod(1 - 2 * betas, dim=0)        # k_t
        self.T = T
        self.betas = betas                             # (T,)
        self.p = (1 - k) / 2                           # cumulative flip prob, p[T-1] ~ 0.5
        self.device = device

    # ---- forward ----
    def q_sample(self, x0, t):
        """x0: (B,D) bits; t: (B,) long -> x_t bits."""
        flip_prob = self.p[t].unsqueeze(-1)            # (B,1)
        flip = (torch.rand_like(x0) < flip_prob).float()
        return (x0 + flip) % 2                          # XOR

    # ---- reverse ----
    @torch.no_grad()
    def posterior_sample(self, xt, x0_hat, t):
        """Sample x_{t-1} ~ q(x_{t-1} | x_t, x0_hat). xt,x0_hat: (B,D) bits; t: (B,)."""
        beta = self.betas[t].unsqueeze(-1)             # (B,1)
        t_prev = (t - 1).clamp(min=0)
        p_prev = self.p[t_prev].unsqueeze(-1)          # (B,1)

        # Likelihood L(v) = P(x_t | x_{t-1}=v) = 1-beta if v==xt else beta.
        L1 = torch.where(xt == 1, 1 - beta, beta)
        L0 = torch.where(xt == 0, 1 - beta, beta)
        # Prior Pr(v) = P(x_{t-1}=v | x0) = 1-p_prev if v==x0_hat else p_prev.
        Pr1 = torch.where(x0_hat == 1, 1 - p_prev, p_prev)
        Pr0 = torch.where(x0_hat == 0, 1 - p_prev, p_prev)

        prob1 = (L1 * Pr1) / (L1 * Pr1 + L0 * Pr0 + 1e-12)
        return (torch.rand_like(prob1) < prob1).float()

    @torch.no_grad()
    def sample(self, model, n, img_dim, t_bits, sample_x0=True, harden=False):
        """Ancestral sampling from absolute noise. Returns (n, img_dim) bits."""
        from model import timestep_to_bits
        x = (torch.rand(n, img_dim, device=self.device) < 0.5).float()  # x_T ~ Bern(0.5)
        for ti in reversed(range(self.T)):
            t = torch.full((n,), ti, device=self.device, dtype=torch.long)
            probs = model(x, timestep_to_bits(t, t_bits), harden=harden)
            if sample_x0:
                x0_hat = (torch.rand_like(probs) < probs).float()
            else:
                x0_hat = (probs > 0.5).float()
            if ti == 0:
                x = x0_hat
            else:
                x = self.posterior_sample(x, x0_hat, t)
        return x
