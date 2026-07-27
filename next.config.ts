import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/cad-runtime/replicad_single-0.23.0.wasm",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };
      config.output.webassemblyModuleFilename =
        "static/wasm/[modulehash].wasm";
      config.resolve.fallback = {
        ...config.resolve.fallback,
        assert: false,
        buffer: false,
        child_process: false,
        crypto: false,
        fs: false,
        http: false,
        https: false,
        module: false,
        net: false,
        os: false,
        path: false,
        stream: false,
        tls: false,
        util: false,
        worker_threads: false,
        zlib: false,
      };
    }

    return config;
  },
};

export default nextConfig;
