from src.research.affine_arithmetic import (
    Affine,
    AffineResult,
    affine_analysis,
    affine_signal,
    robust_option_price,
    robust_portfolio_value,
)
from src.research.almgren_chriss import (
    AlmgrenChrissResult,
    almgren_chriss,
    almgren_chriss_analysis,
    efficient_frontier,
    estimate_volatility,
)
from src.research._common import compute_returns
from src.research.banach import (
    BanachResult,
    banach_analysis,
    banach_signal,
    best_response,
    contraction_constant,
    fixed_point_iteration,
)
from src.research.burgers import (
    BurgersResult,
    burgers_analysis,
    burgers_signal,
    shock_threshold,
    solve_burgers,
)
from src.research.cameron_martin import (
    CmResult,
    cameron_martin_analysis,
    shift_function,
)
from src.research.ccm import (
    EDMResult,
    ccm,
    edm_analysis,
    edm_ccm_analysis,
    edm_signal,
    embed,
    false_nearest_neighbors,
    mutual_info,
    simplex_forecast,
)
from src.research.cramer_rao import (
    CramerRaoResult,
    cramer_rao_analysis,
    crb_signal,
    fisher_garch,
    fisher_gaussian_mean,
    fisher_gaussian_var,
    garch_log_lik as crb_garch_log_lik,
)
from src.research.fokker_planck import (
    FokkerPlanckResult,
    fokker_planck_analysis,
    fp_signal,
    solve_fokker_planck,
)
from src.research.free_energy import (
    FeResult,
    compute_free_energy,
    expected_free_energy,
    fe_analysis,
    generate_policies,
    log_gaussian,
    update_beliefs,
)
from src.research.girsanov import (
    GirsanovResult,
    girsanov_analysis,
    girsanov_signal,
)
from src.research.hahn import (
    HahnResult,
    hahn_analysis,
    hahn_decomposition,
    hahn_signal,
    rolling_decomposition,
)
from src.research.info_bottleneck import (
    IbResult,
    ib_analysis,
    ib_signal,
    information_bottleneck,
    kl_divergence,
    quantize as ib_quantize,
)
from src.research.ito_generator import (
    ItoGeneratorResult,
    apply_generator,
    expected_hitting_time,
    ito_generator_analysis,
    ito_signal,
    num_double_prime,
    num_prime,
)
from src.research.graph_mst import (
    GraphMSTResult,
    betweenness_centrality,
    clustering_coeff,
    correlation_matrix as graph_correlation_matrix,
    eigenvector_centrality,
    graph_mst_analysis,
    graph_signal,
    kruskal_mst,
)
from src.research.koopman import (
    KoopmanResult,
    dictionary,
    edmd,
    koopman_analysis,
    koopman_signal,
    power_iteration,
)
from src.research.lax_milgram import (
    LaxResult,
    lax_analysis,
    lax_signal,
    solve_variational,
)
from src.research.lie_group import (
    LieResult,
    galilean_symmetry,
    lie_algebra_coeffs,
    lie_analysis,
    lie_signal,
    scaling_symmetry,
    time_translation_symmetry,
    translation_symmetry,
)
from src.research.kolmogorov_sinai import (
    KsResult,
    block_entropy,
    factorial,
    ks_analysis,
    ks_signal,
    largest_lyapunov,
    permutation_entropy,
    sample_entropy,
    symbolize,
)
from src.research.malliavin import (
    MalliavinResult,
    bs_call,
    bs_greeks,
    malliavin_analysis,
    malliavin_greeks,
    malliavin_signal,
    norm_cdf,
    random_normal,
    simulate_paths,
)
from src.research.pontryagin import (
    PontryaginResult,
    pmp_signal,
    pontryagin_analysis,
    solve_pmp,
)
from src.research.renyi_entropy import (
    RenyiResult,
    generalized_dimensions,
    histogram,
    renyi_analysis,
    renyi_entropy,
    renyi_signal,
    tsallis_entropy,
)
from src.research.renormalization import (
    RgResult,
    autocorrelation,
    coarse_grain,
    correlation_length,
    kurtosis_at_scale,
    rg_analysis,
    rg_signal,
    scaling_exponent,
    volatility_at_scale,
)
from src.research.riesz import (
    RieszResult,
    riesz_analysis,
    riesz_representer,
    riesz_signal,
)
from src.research.rmt import (
    RMTResult,
    clean_correlation,
    jacobi_eig as rmt_jacobi_eig,
    mp_bounds,
    mp_density,
    rmt_analysis,
    rmt_signal,
)
from src.research.sobolev import (
    SobolevResult,
    matern_kernel,
    sobolev_analysis,
    sobolev_regression,
    sobolev_signal,
)
from src.research.stochastic_control import (
    StochasticControlResult,
    sc_signal,
    solve_hjb,
    stochastic_control_analysis,
)
from src.research.tensor_decomp import (
    TensorDecompResult,
    build_tensor,
    cp_decompose,
    tensor_decomp_analysis,
    tensor_signal,
)
from src.research.transfer_entropy import (
    TransferEntropyResult,
    quantize,
    surrogate_te,
    te_signal,
    transfer_entropy,
    transfer_entropy_analysis,
)

__all__ = [
    "AlmgrenChrissResult", "almgren_chriss", "almgren_chriss_analysis",
    "efficient_frontier", "estimate_volatility",
    "TransferEntropyResult", "transfer_entropy", "transfer_entropy_analysis",
    "surrogate_te", "quantize", "te_signal",
    "EDMResult", "edm_analysis", "edm_ccm_analysis", "edm_signal",
    "ccm", "embed", "mutual_info", "false_nearest_neighbors", "simplex_forecast",
    "CramerRaoResult", "cramer_rao_analysis", "crb_signal", "fisher_garch",
    "fisher_gaussian_mean", "fisher_gaussian_var", "crb_garch_log_lik",
    "KoopmanResult", "koopman_analysis", "koopman_signal", "edmd",
    "dictionary", "power_iteration",
    "RMTResult", "rmt_analysis", "rmt_signal", "clean_correlation",
    "mp_bounds", "mp_density", "rmt_jacobi_eig",
    "GraphMSTResult", "graph_mst_analysis", "graph_signal", "kruskal_mst",
    "eigenvector_centrality", "betweenness_centrality", "clustering_coeff",
    "graph_correlation_matrix",
    "TensorDecompResult", "tensor_decomp_analysis", "tensor_signal",
    "build_tensor", "cp_decompose",
    "Affine", "AffineResult", "affine_analysis", "affine_signal",
    "robust_option_price", "robust_portfolio_value",
    "StochasticControlResult", "stochastic_control_analysis", "sc_signal",
    "solve_hjb",
    "PontryaginResult", "pontryagin_analysis", "pmp_signal", "solve_pmp",

    "GirsanovResult", "girsanov_analysis", "girsanov_signal",
    "FokkerPlanckResult", "fokker_planck_analysis", "fp_signal", "solve_fokker_planck",

    "ItoGeneratorResult", "ito_generator_analysis", "ito_signal", "apply_generator",
    "expected_hitting_time", "num_prime", "num_double_prime",
    "MalliavinResult", "malliavin_analysis", "malliavin_greeks", "malliavin_signal",
    "bs_call", "bs_greeks", "norm_cdf", "random_normal", "simulate_paths",

    "RenyiResult", "renyi_analysis", "renyi_entropy", "renyi_signal",
    "tsallis_entropy", "generalized_dimensions", "histogram",
    "KsResult", "ks_analysis", "ks_signal", "symbolize", "block_entropy",
    "permutation_entropy", "sample_entropy", "largest_lyapunov", "factorial",

    "IbResult", "ib_analysis", "ib_signal", "information_bottleneck",
    "kl_divergence", "ib_quantize",
    "RgResult", "rg_analysis", "rg_signal", "coarse_grain", "volatility_at_scale",
    "kurtosis_at_scale", "autocorrelation", "scaling_exponent", "correlation_length",

    "FeResult", "fe_analysis", "compute_free_energy", "expected_free_energy",
    "update_beliefs", "log_gaussian", "generate_policies",
    "LieResult", "lie_analysis", "lie_signal", "translation_symmetry",
    "scaling_symmetry", "time_translation_symmetry", "galilean_symmetry",
    "lie_algebra_coeffs",
    "BurgersResult", "burgers_analysis", "burgers_signal", "solve_burgers",
    "shock_threshold",
    "SobolevResult", "sobolev_analysis", "sobolev_regression", "sobolev_signal",
    "matern_kernel",
    "LaxResult", "lax_analysis", "lax_signal", "solve_variational",
    "RieszResult", "riesz_analysis", "riesz_representer", "riesz_signal",

    "BanachResult", "banach_analysis", "banach_signal", "best_response",
    "contraction_constant", "fixed_point_iteration",
    "HahnResult", "hahn_analysis", "hahn_decomposition", "hahn_signal",
    "rolling_decomposition",
    "CmResult", "cameron_martin_analysis", "shift_function", "compute_returns",
]
