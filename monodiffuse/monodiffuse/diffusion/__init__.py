"""Bernoulli bit-flip diffusion over the binary latent.

Forward process flips each latent bit independently. With k_t = prod_{s<=t} (1 - 2*beta_s):

    P(x_t == x_0) = (1 + k_t) / 2,    k_T -> 0  =>  x_T ~ Bernoulli(0.5)

so the terminal state is a uniform random bitstring — "absolute noise," literally. The
reverse posterior q(x_{t-1} | x_t, x_0) is closed-form Bernoulli; the denoiser predicts
p_theta(x_0 | x_t, t) (the flip-residual reparam, à la D3PM / Binary Latent Diffusion).
"""

# TODO(phase1): flip schedule (beta_t, k_t), q_sample, posterior, training loss, sampler.
