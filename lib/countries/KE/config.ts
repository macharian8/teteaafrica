export interface CountryConfig {
  code: string;
  name: string;
  defaultLocale: string;
  supportedLocales: string[];
  regionLevel1Label: string;
  regionLevel2Label: string;
  phonePrefix: string;
  gazetteUrl: string;
  parliamentUrl: string;
  actionBodies: {
    anticorruption: string;
    ombudsman: string;
    environment: string;
    procurement: string;
  };
}

const KE: CountryConfig = {
  code: 'KE',
  name: 'Kenya',
  defaultLocale: 'en',
  supportedLocales: ['en', 'sw'],
  regionLevel1Label: 'County',
  regionLevel2Label: 'Ward',
  phonePrefix: '+254',
  gazetteUrl: 'https://www.kenyalaw.org/kenya_gazette/',
  parliamentUrl: 'https://www.parliament.go.ke',
  actionBodies: {
    anticorruption: 'EACC',  // Ethics and Anti-Corruption Commission
    ombudsman: 'CAJ',         // Commission on Administrative Justice
    environment: 'NEMA',      // National Environment Management Authority
    procurement: 'PPRA',      // Public Procurement Regulatory Authority
  },
};

export default KE;
