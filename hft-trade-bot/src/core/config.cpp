// Config manager implementation
#include "config.h"
#include "config_parser.h"
#include "config_validate.h"
#include <filesystem>
#include <spdlog/spdlog.h>

namespace hft {

Config Config::load(const std::string& path) {
    Config cfg;
    if (!std::filesystem::exists(path)) {
        spdlog::warn("Config file not found: {}, using defaults", path);
        return cfg;
    }

    YAML::Node root = YAML::LoadFile(path);

    // ─── Dev format parsing ───
    detail::parse_dev_config(cfg, root);
    detail::parse_v2_dev(cfg, root);
    detail::parse_dev_extras(cfg, root);

    // ─── Production format detection ───
    detail::parse_prod_system(cfg, root);

    // ─── Production: exchange config ───
    detail::parse_prod_exchanges(cfg, root);

    // ─── Production: IPC / SHM ───
    detail::parse_prod_ipc(cfg, root);

    // ─── Production: FIX 4.4 ───
    detail::parse_prod_fix(cfg, root);

    // ─── Production: Signal Engine V2 weights ───
    detail::parse_prod_v2_weights(cfg, root);

    // ─── Production: pressure model ───
    if (auto pm = root["pressure_model"]) {
        if (pm["enabled"]) cfg.pressure_model_enabled = pm["enabled"].as<bool>();
        if (pm["toxicity_threshold"]) cfg.v2_pressure_threshold = pm["toxicity_threshold"].as<double>();
        if (pm["toxic_penalty"]) cfg.v2_toxic_penalty = pm["toxic_penalty"].as<double>();
    }

    // ─── Production: smart order router, v3, adaptive ───
    detail::parse_prod_router(cfg, root);

    // ─── Production: risk (extended) ───
    detail::parse_prod_risk(cfg, root);

    // ─── Production: remaining sections ───
    detail::parse_prod_extras(cfg, root);

    detail::validate_config(cfg);
    return cfg;
}

} // namespace hft
