import { Config } from '@remotion/cli/config';

Config.overrideWebpackConfig((currentConfiguration) => {
  return {
    ...currentConfiguration,
    module: {
      ...currentConfiguration.module,
      rules: [
        ...(currentConfiguration.module?.rules ?? []).filter((rule: any) => {
          if (rule === '...') return true;
          if (rule.test && rule.test.toString().includes('.css')) return false;
          return true;
        }),
        {
          test: /\.css$/i,
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: ['@tailwindcss/postcss'],
                },
              },
            },
          ],
        },
      ],
    },
  };
});