/**
 * UNI 监控面板 — Cloudflare Worker
 *
 * - scheduled（Cron 每小时整点）：抓取 DeFiLlama + CoinGecko，计算快照写入 KV（key="snapshot"）
 * - GET  /api/snapshot：读取 KV 快照；KV 为空则先触发一次抓取再返回
 * - POST /api/refresh ：手动刷新快照
 * - 其他路径：托管 public/ 静态前端
 *
 * 抓取失败时 try/catch，保留 KV 中的旧快照，不覆盖。
 */

// 构建时由 scripts/build.mjs 注入 public/index.html 的完整内容
const INDEX_HTML = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<link rel=\"icon\" type=\"image/png\" href=\"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAaTklEQVR4nL2be7RlVXXmf3Ottc85933r1vsFVUXxkreAWIJSAhKCrSGNaIi0jsSonY5RxkjiaF9RSfoRYndreiR2xohJtBvtYEwgIKKtLUroAIVIURRUFVA860Hdet3neey91+w/1lr77Fsg0mj6jHHHOfecfdZec85vzvnNOdcRfg4PBUFVxBiPanhPdbhztLPUel0JeqZYzlVYj2cVqkvFyGK8Cqoo2gE5Iuh+NfaAFOXDKPe5IfMkIpMMDh4QkRxAP62Gz6Aioj+PvcvPuoCqStqMqkp3pnuqhZPx5SavbBLkFFXfMmKsChbvDV6NCCYuEHQAiqpHxAOFKAVGDiu6Hbgna2b3YltPyqA8G+9l4GdXxKtWgKoKgIioqmb5THuT936zEXMVcJpBGiIGQUHDnVTCS7yiquHmQnitggDqPQIIJvwPqHq86lFxdosX/Ubm5U6ZGHym2ocIaen/LwpIVheB7tH5TapcI0avylxjvS9LfOnDboSkJcQIImGnpPcUUI9K3L5X1PvoFQreox5EVaRUbJaRl3mOkbtMxi12bORWEdlT39M/qwLqN5mbm1ttS3mf8fxK1myc6suSIs8VMRgriDEiJsqroBUMtHZXqZAg8aN0WdCgoqUGNylK1V4JImQDTSl7vbbAPerky3bR8NdFpPtqlPCKFZAWV1XbnZ67QsT8NnBpwzrXK3IvImKsDXAUEBHUR2E1ShXvJhpgT03euuASnzX9n5SoHp+XUJQeL8Y1GxR57xBG/s459x9k0cBTddf8uSmgEn5yciRvDn0ElQ86Z9cURQEGb4w1YqRmxmMXCAiQBPV4Td/qSUEKvr8rWbBe0grglbKbq+alOueMiFDit9jhwT9mwH5DRPwrRcNPVUAl/MzM8h72Mwbza0akWeSFSmaxzgRPr8F24fIBwsHCNROH3FlTQF++dBkpZKiGW/QvC/Eh92ivUEqPazSkUP+0a2Z/yHjrJhHpvBIluJcV/tOfNiLiDx06tLar7o+cNdeqgsd728yC1es7P8ZYx5iTWlgPAa/uFhD1GLOBpMxYXzLFkYiOhkWsEe3mFO2uN9asK9R/zhwsjtPJyc+JyMxPU8JPREBl+YNza/KGudE5d21ZFKoC1gVff7HF6wukXb9IK/2vRGSIkbjUMWv5/sUiEr+qiAeMRHApIuDbPXy3UGuMeKFjmo3PG9P9jzIxMfVySjAvK/zMzPK8YW90zl2b57kqYLOa8PUNS9yUAL4WzmvCioLUdC4ilWBSXyh+XUTDDquAKggm8IkUR+I2pJlhGk58WapAy3fz60tpfUBVXQzeL2nsFymgEn5al+Te3mCMXFuWpYqRvvBeoVf0BdZorTK6QqQyJLITLa0a8nwlbcp7lftIpbw+XqKCjID6hfFCA6FCQ4A1rQxpZqKlV5P7ls51ry/nOtepqk2yvawC0gWqanO6H0Dkveq9KoptuCA8gPewbwYOzAUL1tBdN2fya4yAqdSywBNSMgxsUGtfitfXkBbkr0XK+nMKlE2HWCulL9V5WaVH25/I2+0LX7ELiIgW891fAn7TWtsMPu8kbVoUaDgYzODup9Ete/oBzofgliyvAlIqzPaQTolmFm1YKH1lNRGJ9k7ySA0h1Zuoj1eZaIdImSHEgIpNYpCmw2RWil7PWzUbTdt/UlXXvpQrVApI0J+fn1+L8pGs1VhTlKUP5KaGEjRAfeUonLEc7tgFt++AzICVYEWSjwq0c3h2Ch7ai+w6CAfnoekChGNNkCCf6oIKFyJohL1YE7OEoil2iIaYonXFK5JZZKABmZWylytzvUv8dOdDqvqirHesCziby2+JkQuLXs8ba4xYk6DRt4oo5CWcsQKuPAlu3wk3bQ1xILNUdLebo1v3w7NT6FADtu6HL/0I7n4GMhuE9okn+OBaGqK8VgKFuKDzvYgckEpxcU8mFl1I5RJiDWYgE49ixVg/37u26BaXH4sCEwU3IqL5TPsNYuRqY6xFwFhTC1TaV0Typk4Or18L7zgN/asH4Y/vDnC3JrhK7uF/boX33Ay3PIa+aR28ZhncvA1u2wHGhD8RNHNgLWJNJIWKeA1oQeDJw0juIaZMkaikesapXMeHZ2exDSdFt+edurVmuvPrqrooIR7AxReqqs3eXOeXGlm2Me92vclcMH0twC2IzCn/9Aq4/ERktgd/cBd6eB4+8WYYa8JABqMtmJlGPn8PrFuEvu+1yLIh9E/vQ+d6yNWno1MdONJGWlmILYsHwBn0UBt5dDJYd9chOG4MyCpGKJXAtS15jxBdRwRpZWjhxbfbqg3z5rLdu8INNr+W+gkOEBHxOt97naj+si/K8E4F+T7UUu4leoGiiDEw10M3HQe/8wa48W7IS+RjF8PacXTDIqQ5FNDyvSfgypPQi46HyTnki/ejt+8ISDnSRgcc0nKwfBjWTcCpS2HFMOw4CH+7HR1rIZdvBKOxTK5ZRSS4SIwRpACbWaSZiZ/peNdqThRz3atU9bvAQVUVF61v87nuxVnWXN/rdjWkvGTuWgSsqGxURorOTQcvHIRNx8Nnm8gn/xd+/yxyw6Vw7hp04xLY/jzyyAGY60GvhLdsRCfn4HfvQGZmAdtfHNCshWyYgPNWo794EkwMIF+8L6Dj7FXRE1Pq7GcJqbiJ9GuJhkVFpJyZVzPS+gXmuxfKUOuWm2++2RoR0c7U1DpVfYuPhKfu5inHVvk75eVaUFSRsNnnp5ELj0f/y5XI9gPw/luQox1468mBwe2dghdmK8jyrjPgQ5ugOYgaB7YJpomaJuQe3bkfbtoC/+lu5OL1cPZKODiPznT7e6uIEmBrgdprQEQKrA0n3nuMN2N0yvNVtXHNO6/xBsCZ1lkob/CqYoyp2lYBSSmtgaTguSCTxhuNtmC8iT68H968Af7b2wNE/933Q+C75mw42kG+8hAcng8LOoN88HXou88Oaa0sF/q0bYDJkF2TgT9cvAHOXIE403eBumF8evakplJVOGUx4HY6Wpb+UmCdIGp0Ukc8epGz1hH4tiTGpr7m/1VnooaC+lt5CRsnkENzsPswsnk9fOVqmBhEbtqK/tbr4F9fgD5xCPbOgDWBJC0dQj65Gd7zWmg58D1ES4iJTQFtNZDRZpD4O0+ghQcTCWNFwnysFulDP73jFeMs0rB4ECn8OUzPbQQwnayzTOGieLlKYiRJsJqg9UZmv2gnsDMIKWu4AV97GH12Cl0xAicvgUdeCLv9wlvhC1fCqhGkiL5beFg2DJ+9BL3xCvTCE2DxMGiBlG3Ed2Gsha4dg4f2wae+g3z7caTlEO9BfSRUacd9/5XYd0xltzgjCpieb1DIBaracs6yVpUN/QCSYJ64do24E7VeK1MVCcQkvqX3Pg9//SA8dQSZL9B7n4XLTkCOG0dLDycsjl3h0CtItBYPsnIUbrgspL+dk7BvOqTHVaOwZwZ2HoT5Ar76ELxpHSwZhMKHNaypcYK+G4VMFRQjmcW3c6VXSOndeRaWOFFOUmho8pXK9Mc8J8vXagKVwMoAcAI/eBq+vg154Sh8/yl04wTywfPh2rNgzQh0yrBRKzE4BXiSWdg/g378O3DyEuSN6+H0ZSFlOgODGdIt4N9cAFeeDH+3He7aDf/qHJjuUlWoAbKRYEmMY9Lfp09yCHjdCIy4UvVsBLfAoesCx6ZOFRNqgbbe7BQr6M3b4Nmj6EcvCRR5+RB6/Di0C+TuZ8KN53PkrJXoeBOpa3fZMAw45PatcMcudMkQsnIYGWnColbgBKcuD5bfsAhmujCf90tMr6iYkBZLH5QcyZr4eJFIMIAKFH4ps52VDvQkQWyN7CFahZPQram4N7VUGC4PHETQA3PIjsmQDX79XPTkJchcN1jwbx5Gb9uBnLcmVI9Xn46863Qqvyk8jLWQt58Kjx+Cdg8OzMCBo0AIbnJ7ExYNBJL0L08L1k8GSc0S9X3E1hERY5ZIdHMFLXyG2lOciFmk6k1AgDkG9YL3gWxIDHqqKSNIEF8jxPbOwFQXXTGCNC20e2i3CIHxaBfZsgd95AAsH0YXD/RphMYKzwn82rnI4TZ8+UGY64LJQoBV0NIjh+fg8Az80UH40R742MWhIPM+VjUS+FRa2PflAA2osAadL8AjiC53KGvRGCYSv0+PVIOnfpxSlbthWQkdnlYDnjwMk3Nw/upgdST4YjuHXz0TVgwjM1108wY4bqwaeIQoHRdfOggffSO6ejRUl4/uB1+gZIFyY8Nf4eHOHcHPb7wCXTMaCiWpNhZREbswZdREjAsUJYixHl3hQJea2FZaEOUqd49Wr+jhMSlSJAh511MBspteH1Kh91VklsWDgfWlkFH2W2MalYBIaHOPD8BvnIecuQJufRS27kMefgG6HcD1K0gV+M4T8Iu7kevO7hstuWciViYoQctA7BAk7ktQHXf1HluyRkX56xkg+lK9KsaDNl0gJ3fsRFaMByo8kEGniN0bCVD0vipf1fRLDTFSQVVEUGeQJ6dhrAUf3wy7j8DD++HOXfBPz8HMbF8RRQn/8Bh62QmwciSggBpfSXVBfSQZy2+8FwMtJxhiuzb4dp/8Bb9KI900tYn+jwfNbOD2//0heG4SPvQm9NSloVlCuL4CTYojVip4iS5EHF4Dzd0/gzx9BLbug/+9G33nGfCZS5HHD8L3n4I7dsKB6bDwjoPITBdWjwZ4m1oDy5iKsaomZccBLIoHcYq2VbVlU6chWb5matGFExzxilqB2S7y5/ejtz+KjI7A5vUwMRBSnYmpJzUxawitu1efb4RdqoAUHp6bCu2zv38IuecZuPxE+I3z4N9vhIuOhz/fAlueQ9tFmBNUi1PNDOr3rkieD40W08g8Vo44VZ0SaPZH7HUykAiGVP+GTWpY8Js70D+7F+a76PKxAFtjguVj1qioc7R28vewQd9vdiqhPlCFbfth/yxsXAzDw8Ha/+Mh+MFueOcZ8OFNocD6vW8h+2ZDobNAkQS01ht+msiX9lOYZ9YYI3tBfegiJZ9Jm9Tquwug2nDojkPojf8IR2ZALDI5Az/eF+cFBJ4utZsHeUnSqvehl9dyMNSA0SY0DNy+C27dAeethjceD6tGwtetwHOH0S/8H/SGu2DFSAisr18DrSwaqA/3Y+9NJEhalGFvUBrlWaewG5XTRHEhnwoLUUBsXEbpjSC9Eu7che4+jIyPBEbWy+GL98HKEfjl10Qoa+QM0fIpKDVdQNLhNjLVQae6oW9w/3PwzZ1w/mp428lBMZs3wO6D0b8zKBT+cgsMZfC2U+CECRhpoN0idoqPocUoeAktNu/D90uFzChO9jjx+rgaKUCb6lFjjPRbXyHUC1KNo0QE7RShMBltwbvPgm370e/ugqcOw+99KwTGa06H8YF4TsBT1RrzPXT7C4E4PXkYfW4KOdJG984gLYdedzby9lOCOwG8/zxky/Pw4+fBuMhMPXxje+g7XHpC6C16De6XYkBZT2FUvu/zIjRfW66DazzhRGS7qnrBhLhYE73q/EiNAEV/FhG09OiKYTg6FpzOOGT/NPrxO+HgHPzbi8MXIvS19MjkPLJ3NpCmiVaI3osGkPEBWLcIGc4CcSlDyuTExfDec0IfYaaDiEXEwJ6jsGMSLtkQOsmJAGisMFN6TS13kdCz8AqZgDV7yDjsrLePYIrDYmTEl4qpJf+qAaRUNTVIoLqnLEG+nqNfegCZ7gEu1AzWQa+LfPeJ0ACZGAgM29lw84aFC49DBxtI04Zg2osb8z68hj6UC4WrXoPc/zx8bSv9QO3hUDuQMGuCwiq/p0qr1VoaFCJiIDOYhv0xcMjN+5lDTRncRumPk9IH7l+Nq9OCtZRYemja0AUeasKu/YRjBv1Jr+ID2XGx9N03i96/B374NOydCnBVQgW46Ti4fGOo7XPt09W08dLD+AB84Hz48X547IV+nIpIURMHKGh/0CISukZpqaJE81JRFVoZZO4+4LAbXLz4QH5k7p9Ezb9QT2gwNOyC3I1SDTfVa8jTpyxB3nE6/Nm9QVhPSGtlCUvGketeC0WJ/PWD6M3bkJ2TgeDQq0ykZMhtj8EDe+CjbwyVXq+sMkWiEVJ4OG1FiPo3HOinurEWNB1SllHg6ApVCBPEl6gYNC/RmS5GhNLKjB3MdomIOhHp5Ufb93vv54yRIQ3D4FgX9RsK9SygRWiC6q+eBd99Atm5F8jQkSactAT57U2h83P9N9Fv7UC6RegciYHBkVDrW4HpDhycha/8KKTB37kIBl0odlKfwUhglsPN0AtYMQL7pmBiOLTbmhbmyoqj1MtjAIyN8Sogwww08Zn5IfA4Ebs4Wzycl9zhXOOavNercnSMKSny9bVqQHslnLYM3n8e/OUD6MYlyFtODI2QkQb8/WNhnrdiBN07C3kR/P/dZ4drpruwdyb0Ce7ZDX/zMLzj9DBwzWvnABI98x4mBuHExejeQ8ilG+DsFaHmSG4qpnZGIb5nJJTmc73werSJGWl9D9ijquLiXPBAcXD222VRvAPv0cIjDYmUUisvqDIDUctW4F1nBoGWDQcBjUF7JXL1aaHBsWMS/nZbYHICXHUqMpiFHD/UQH7zgtAm3zUJ2/bBSYujj9MfhlbluEfmcmTd8qDIlaMhCMZJMT6VvdH5U5+wk6N5oc5leMt2M5jdE4ekpiKLZSt7APEPZllDfF5omgskZhjm+DEdJjpbKow00ePGw3SoVOgU4XvOwICDc1fBH7wFPrYZRlrw/DScsgzWTwS+v24c3npy2PTuI9At+usn/h5TmkzOw5pR+P03wwVrw7WJsXpqTVHt9wF6BX6uB4VXxobEDLe+DTwYj9iqS2fqgG2l11vKvDhHVMV3Ckwrq5UBqU0m/fM5CSB5P2D1raehRQXBEu87F20Y5LYdARW9EjZMhL+rXgP/sCM0VVK5mpchdWqk1EUZxmLXvyHUAQmSCeYpcySfiWcGtFugquoGW8Y39Gkz0rhDRApVNQK+OjAgIl7b7a+WHb85y5qXFp2uxxmDjePrCP9w36CEYKgQHzQGrH6DIxojxhKcCY2L9Yvg0UlYOgQXHhco7SlL4ZINcPfTcGAWTlwCXQnBsDKqwvGLojL6hK3SvI25XqnGYZQe7RYqpeKdtM3igb8CfhgPg6TqJ8WLcEKkmJm/Vjv+T4yyxOPVZJn0D0PVCiK08rV09FViPV4pISmi3m4fcP383i1CwMssPHMEPvO94NcffF1ojx3thHH5SDMQoqooS/mRvrsIMQBqpSSd66GzXW9bTeOXNO81K8Z+RUSeqR+bW6CA+HLYT3X+K4V/j88LFSNGmpGDp5slshF9VFSrbo/IQhepn5Ws8neyaHIP1aCEp4/ArY/B3mlYNRoOX5y5on/PxHjTw9QUW/i+sksPUx38fFeNsaKLBo6a1WO/K033pWPPDC4o+9KHnenOqbaXf9mpPb/odr00nTFNB5gQiVOmScCIgpOKHojT6Zo/poFFmtomVFU3lwDj+RymOkGQ4SzMC+tCl1GjqQscO08QW22q6JE2Ot9DVJWJIWXF6F+Ywex6oBMM8xMUUFdCPtd5O3O9zxsv68uiUNN0Ypqx7k4BJ84MJDJF4oisOijloTrIlMhJQoGpcYvkKmW8pmFj2VpEBMkxCOpzhCrlxc91tgczHXy7p27RsPjVI7eYsYGPiMizL3Vi9CXPCkd3uL00srSc6n7OIuNlJ1dATNP144FSHVBAa0hIt0g9xfRIgwyb3Ii+K9UF6xZRGVpx+srtakVZdbAquoJOd8LZgdJ7t2jY+KVDj5ixgRt+kvBpiwseVXAQ8bbVuMlm9k+8kY4xVrRbqG/nfUtVite+8FDx8vrttC6j9vN76llUGaN+ALtvkSCwNWHHxgSK7Gx4r1D0aBumO2jpvR1sGT/eetIsHfoUsPXlzgq/JALSUbJ45PxzHJpv+F5+vRHT8r0iyJrZBUxRqoBQ7TpstDZWkxSkanxd0hrps9Q6F0LXOOmjZmm8r84BMZ+jM120m6t2C9yiEeMXDzxhRgc+AdwGL//DqhfFgPqj9iuRkfLI3Ie1U3zYlCwry1KNs4gzQRECVUHqfTjUWKXC6pD7wnRY+D68oZ8tqqZmPVYQiJDtT31RhbkePkBexStmbFD80qEHzWj2+zh3p4iUr/q4/EsoocFs+5pitviUQ04uezmqXk0zE6xFsihJTejAEWL0T7m7LOPZYdMnNK6WHaobE1zNJCpcy6dFGSw/20Xz0ttWw/gBW5oVo7cx1vqsiDxU3/vLyfdTFXCMEqToFJeZbv4RP925zKk0Cw07M5kVyQxaNVWlZvAaeakLXcbPqkamvriflxYp47GZmS7a7qFFqZJ77NiQ+JFs0kwMfpWhxn9+uYD3qhVQV0J8vcYfnn+/n++912GP990eJeF4jWlYwZrgBs7UDl1IdRIk/D4yKKkaY6XdGBOuK6NCch8obSeH3OPbPcUrbnBAfFNg2fA/mtHBP8Vyyyv9mcyrUsCxilDVjE6xuZhqX0evuMKJXeZ7Ob6Mkw4jGGuEzEGWfghDnwuYOJKrWztR2VLRvIC8DI2M3CtFifYK3FBLdMDhM/uILBq4w4y2/kJEHj/WSP9sCkg3CrLEADnVfpvkxWXa879gXbaK+S5lXoLGH0HGvC/GgJOADo9gQ49R8wIUJQ9+rr5EOrGLZEWMtUizAQ1D2TSPynjzVjPYugXYUj/8/P8q/KtWQF0RNbcYp1Oc7zu9zeT+Ui3Lc0xPG5K6vEo1mQm5u+wToMJXvi8m5vvSh2FG0+FbbkZa9geamTv92OADGTyQIvyrFfznooCkhPomVDXrdtnQLLonkJcX+MKfR15u1NIv09xbKdWoiKVbCL4UEMQajzUeZ1SsKWmYnhp5SqxsN63sRwy3tgOPi8jzUZcSp82vWvD0+JkVkB5REVWdHd9rAUvodkeKLhvEF6ts5lZizGpf6iLwrTg/PWzgYGnkiFXZSVOeI8sOAkfFmINVWy6c8KZ+j5/18X8BrUFwyVS+fNYAAAAASUVORK5CYII=\">\n<title>买入温度计 · UNI</title>\n<script src=\"https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js\"></script>\n<style>\n  * { box-sizing: border-box; }\n  body {\n    margin: 0; background: #f1f4f8; color: #1c2333;\n    font-family: -apple-system, \"PingFang SC\", \"Microsoft YaHei\", sans-serif;\n    -webkit-font-smoothing: antialiased;\n  }\n  .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 20px 40px; }\n  header.top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }\n  .kicker { color: #d6336c; font-size: 14px; font-weight: 600; margin-bottom: 6px; }\n  header.top h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: 1px; }\n  header.top .sub { color: #8d99ad; font-size: 13px; margin-top: 8px; }\n  #refreshBtn {\n    background: #fff; border: 1px solid #dee5ee; border-radius: 10px;\n    padding: 9px 16px; font-size: 14px; color: #1c2333; cursor: pointer;\n    box-shadow: 0 1px 2px rgba(20,30,50,.06); white-space: nowrap;\n  }\n  #refreshBtn:hover { border-color: #d6336c; color: #d6336c; }\n  #refreshBtn:disabled { opacity: .6; cursor: default; }\n  .card {\n    background: #fff; border-radius: 14px; padding: 24px 26px;\n    box-shadow: 0 1px 3px rgba(20,30,50,.07); margin-bottom: 18px;\n  }\n  .sec-label { color: #d6336c; font-size: 13px; font-weight: 600; margin-bottom: 6px; }\n  .sec-title { font-size: 20px; font-weight: 700; }\n  .sec-sub { color: #8d99ad; font-size: 13px; margin-top: 4px; }\n\n  /* 结论卡 */\n  .verdict { display: flex; gap: 24px; border-left: 4px solid #e03131; }\n  .v-left { flex: 1.2; }\n  .v-left .label { color: #8d99ad; font-size: 13px; margin-bottom: 10px; }\n  .v-text { font-size: 38px; font-weight: 800; color: #e03131; margin-bottom: 10px; }\n  .v-text.buy { color: #189a52; }\n  .v-text.wait { color: #d08d26; }\n  .v-explain { color: #5c6b82; font-size: 14px; line-height: 1.7; }\n  .v-right {\n    flex: 1; background: #f1f4f8; border-radius: 10px;\n    display: flex; align-items: stretch; padding: 18px 0;\n  }\n  .v-right > div { flex: 1; text-align: center; padding: 0 10px; }\n  .v-right > div + div { border-left: 1px solid #dee5ee; }\n  .v-right span { display: block; color: #8d99ad; font-size: 13px; margin-bottom: 8px; }\n  .v-right b { font-size: 22px; font-weight: 800; }\n  .v-right b small { font-size: 13px; font-weight: 400; color: #5c6b82; }\n\n  /* 刻度条 */\n  .gauge-head { display: flex; justify-content: space-between; align-items: baseline; }\n  .gauge-val { color: #c2255c; font-size: 26px; font-weight: 800; }\n  .gauge-bar {\n    position: relative; height: 14px; border-radius: 7px; margin: 18px 0 8px;\n    background: linear-gradient(90deg,\n      #e03131 0%, #e03131 30%,\n      #f08c00 30%, #f08c00 55%,\n      #fcc419 55%, #fcc419 72%,\n      #40c057 72%, #40c057 100%);\n  }\n  .gauge-tick {\n    position: absolute; top: -5px; bottom: -5px; width: 4px; margin-left: -2px;\n    background: #1c2333; border-radius: 2px;\n  }\n  .gauge-labels { display: flex; justify-content: space-between; color: #8d99ad; font-size: 12px; }\n\n  /* 图表卡 */\n  .chart-head { display: flex; justify-content: space-between; align-items: flex-start; }\n  .win-sum { text-align: right; }\n  .win-sum span { display: block; color: #8d99ad; font-size: 12px; }\n  .win-sum b { font-size: 20px; font-weight: 800; }\n  .tabs {\n    display: flex; background: #eef2f7; border-radius: 10px; padding: 4px;\n    margin: 16px 0 6px;\n  }\n  .tabs button {\n    flex: 1; border: 0; background: transparent; border-radius: 8px;\n    padding: 9px 0; font-size: 14px; color: #5c6b82; cursor: pointer;\n  }\n  .tabs button.on { background: #fff; color: #1c2333; font-weight: 700; box-shadow: 0 1px 3px rgba(20,30,50,.12); }\n  #chart { width: 100%; height: 380px; }\n\n  /* KPI */\n  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 18px; }\n  .kpi {\n    background: #fff; border-radius: 14px; padding: 22px 14px;\n    box-shadow: 0 1px 3px rgba(20,30,50,.07);\n    display: flex; flex-direction: column; align-items: center; justify-content: center;\n    text-align: center; gap: 9px;\n  }\n  .kpi .k-label { color: #5c6b82; font-size: 13px; margin: 0; letter-spacing: .5px; }\n  .kpi .k-val { font-size: 27px; font-weight: 800; margin: 0; letter-spacing: -.5px; }\n  .kpi .k-sub { font-size: 12px; color: #8d99ad; display: flex; align-items: center; justify-content: center; gap: 7px; flex-wrap: wrap; margin: 0; line-height: 1.6; }\n  .badge {\n    background: #fde8ef; color: #c2255c; border-radius: 6px;\n    padding: 2px 8px; font-weight: 700; font-size: 12px;\n  }\n  .badge.gray { background: #eef2f7; color: #5c6b82; }\n  .rh-body { width: 100%; flex: 1; display: flex; flex-direction: column; justify-content: center; }\n  .rh-row { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 14px; width: 100%; }\n  .rh-row + .rh-row { border-top: 1px solid #edf1f6; }\n  .rh-row span { color: #5c6b82; font-size: 14px; }\n  .rh-row b { font-size: 22px; font-weight: 800; }\n\n  /* 双列 */\n  .cols { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; margin-bottom: 18px; }\n  .cols .card { margin-bottom: 0; }\n  table.yt { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 14px; }\n  table.yt th { text-align: left; color: #8d99ad; font-weight: 400; font-size: 13px; padding: 8px 6px; border-bottom: 1px solid #eef2f7; }\n  table.yt th:nth-child(2), table.yt th:nth-child(3),\n  table.yt td:nth-child(2), table.yt td:nth-child(3) { text-align: right; }\n  table.yt td { padding: 11px 6px; border-bottom: 1px solid #f4f6f9; }\n  table.yt td .rv { display: block; color: #8d99ad; font-size: 12px; margin-top: 2px; }\n  table.yt tr.hl td { background: #fdf0f5; }\n  table.yt tr.hl td:first-child { border-radius: 8px 0 0 8px; }\n  table.yt tr.hl td:last-child { border-radius: 0 8px 8px 0; }\n  .main-tag { display: block; color: #c2255c; font-size: 12px; font-weight: 600; }\n  .price-big { font-size: 34px; font-weight: 800; text-align: right; }\n  .price-row { display: flex; justify-content: space-between; align-items: baseline; margin: 6px 0 14px; }\n  .price-row .sym { color: #5c6b82; font-size: 15px; font-weight: 600; }\n  .mcap-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }\n  .mcap-boxes > div { background: #f1f4f8; border-radius: 10px; padding: 12px 14px; }\n  .mcap-boxes span { display: block; color: #8d99ad; font-size: 12px; margin-bottom: 6px; }\n  .mcap-boxes b { font-size: 18px; font-weight: 800; }\n  .div-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }\n  .div-note { color: #5c6b82; font-size: 13px; line-height: 1.7; }\n\n  /* 方法 */\n  .method-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; }\n  .method-grid h4 { margin: 0 0 8px; font-size: 15px; }\n  .method-grid p { margin: 0; color: #5c6b82; font-size: 13.5px; line-height: 1.8; }\n  .method-foot { margin-top: 16px; color: #5c6b82; font-size: 13.5px; line-height: 1.8; }\n\n  footer.src { color: #8d99ad; font-size: 13px; margin-top: 6px; }\n  footer.src b { color: #5c6b82; }\n  .err {\n    background: #fdf0f0; border: 1px solid #f0c4c4; color: #c04444;\n    border-radius: 14px; padding: 26px; text-align: center; margin-bottom: 18px;\n  }\n  .err button {\n    margin-top: 12px; background: #fff; border: 1px solid #f0c4c4; color: #c04444;\n    border-radius: 8px; padding: 8px 18px; cursor: pointer; font-size: 14px;\n  }\n  @media (max-width: 860px) {\n    .kpis { grid-template-columns: repeat(2, 1fr); }\n    .cols { grid-template-columns: 1fr; }\n    .verdict { flex-direction: column; }\n    .method-grid { grid-template-columns: 1fr; }\n  }\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <header class=\"top\">\n    <div>\n      <div class=\"kicker\">买入温度计</div>\n      <h1>现在买贵不贵？</h1>\n      <div class=\"sub\" id=\"dataLine\">数据加载中…</div>\n    </div>\n    <button id=\"refreshBtn\">⟳ 立即刷新</button>\n  </header>\n\n  <div id=\"errBox\" class=\"err\" style=\"display:none\">\n    <div id=\"errMsg\"></div>\n    <button onclick=\"manualRefresh()\">立即刷新</button>\n  </div>\n\n  <div id=\"main\" style=\"display:none\">\n    <section class=\"card verdict\">\n      <div class=\"v-left\">\n        <div class=\"label\">当前结论</div>\n        <div class=\"v-text\" id=\"vText\">···</div>\n        <div class=\"v-explain\" id=\"vExplain\"></div>\n      </div>\n      <div class=\"v-right\">\n        <div><span>主收益率</span><b id=\"vYield\">···</b></div>\n        <div><span>估值档位</span><b id=\"vTier\">···</b></div>\n        <div><span>收入方向</span><b id=\"vDir\">···</b></div>\n      </div>\n    </section>\n\n    <section class=\"card\">\n      <div class=\"sec-label\">估值刻度</div>\n      <div class=\"gauge-head\">\n        <div class=\"sec-title\">销毁收益率</div>\n        <div class=\"gauge-val\" id=\"gVal\">···</div>\n      </div>\n      <div class=\"gauge-bar\"><div class=\"gauge-tick\" id=\"gTick\"></div></div>\n      <div class=\"gauge-labels\"><span>0%</span><span>2% 偏贵</span><span>4% 便宜</span><span>6%+</span></div>\n    </section>\n\n    <section class=\"card\">\n      <div class=\"chart-head\">\n        <div>\n          <div class=\"sec-label\">进罐子的钱</div>\n          <div class=\"sec-title\">协议收入</div>\n          <div class=\"sec-sub\">分链日收入·仅完整 UTC 日</div>\n        </div>\n        <div class=\"win-sum\"><span>窗口合计</span><b id=\"winSum\">···</b></div>\n      </div>\n      <div class=\"tabs\" id=\"tabs\">\n        <button data-n=\"7\">7天</button>\n        <button data-n=\"30\">30天</button>\n        <button data-n=\"90\" class=\"on\">90天</button>\n        <button data-n=\"0\">打开开关以来</button>\n      </div>\n      <div id=\"chart\"></div>\n    </section>\n\n    <section class=\"kpis\">\n      <div class=\"kpi\">\n        <div class=\"k-label\" id=\"kTodayL\">今日</div>\n        <div class=\"k-val\" id=\"kTodayV\">···</div>\n        <div class=\"k-sub\"><span class=\"badge\" id=\"kTodayM\"></span><span id=\"kTodayD\"></span></div>\n      </div>\n      <div class=\"kpi\">\n        <div class=\"k-label\">7天日均</div>\n        <div class=\"k-val\" id=\"kAvg7V\">···</div>\n        <div class=\"k-sub\"><span class=\"badge\" id=\"kAvg7M\"></span><span>× 8月基线</span></div>\n      </div>\n      <div class=\"kpi\">\n        <div class=\"k-label\">30天日均</div>\n        <div class=\"k-val\" id=\"kAvg30V\">···</div>\n        <div class=\"k-sub\"><span class=\"badge\" id=\"kAvg30M\"></span><span>× 8月基线</span></div>\n      </div>\n      <div class=\"kpi\">\n        <div class=\"k-label\" id=\"kYtdL\">年初至今</div>\n        <div class=\"k-val\" id=\"kYtdV\">···</div>\n        <div class=\"k-sub\"><span class=\"badge\" id=\"kYtdA\"></span><span id=\"kYtdM\"></span></div>\n      </div>\n      <div class=\"kpi\">\n        <div class=\"k-label\">Robinhood 收入占比</div>\n        <div class=\"rh-body\">\n          <div class=\"rh-row\"><span>7天</span><b id=\"kRh7V\">···</b></div>\n          <div class=\"rh-row\"><span>30天</span><b id=\"kRh30V\">···</b></div>\n        </div>\n      </div>\n    </section>\n\n    <div class=\"cols\">\n      <section class=\"card\">\n        <div class=\"sec-label\">双市值口径</div>\n        <div class=\"sec-title\">年化收益率表</div>\n        <table class=\"yt\">\n          <thead><tr><th>收入口径</th><th>流通市值</th><th>FDV</th></tr></thead>\n          <tbody id=\"ytBody\"></tbody>\n        </table>\n      </section>\n      <section class=\"card\">\n        <div class=\"sec-label\">市场定价</div>\n        <div class=\"sec-title\">价格与市值</div>\n        <div class=\"price-row\"><span class=\"sym\">UNI</span><span class=\"price-big\" id=\"pPrice\">···</span></div>\n        <div class=\"mcap-boxes\">\n          <div><span>流通市值</span><b id=\"pMcap\">···</b></div>\n          <div><span>FDV</span><b id=\"pFdv\">···</b></div>\n        </div>\n        <div class=\"div-badges\">\n          <span class=\"badge\" id=\"pChg30\"></span>\n          <span class=\"badge gray\" id=\"pDiv\"></span>\n        </div>\n        <div class=\"div-note\" id=\"pNote\"></div>\n      </section>\n    </div>\n\n    <section class=\"card\">\n      <div class=\"sec-label\">判断方法</div>\n      <div class=\"sec-title\">只看两件事</div>\n      <div class=\"method-grid\">\n        <div>\n          <h4>1 · 收益率档位</h4>\n          <p>主收益率 = 30天日协议收入 × 365 ÷ FDV。2% 以下偏贵，4% 起进入更便宜区。</p>\n        </div>\n        <div>\n          <h4>2 · 收入方向</h4>\n          <p>7天均值比30天均值高 5% 以上为\"在涨\"，低 5% 以上为\"在跌\"，中间为\"走平\"。</p>\n        </div>\n      </div>\n      <div class=\"method-foot\">为什么不看总交易量：0.01% / 0.05% 低费池抽取 1/4，0.3% / 1% 高费池与 v2 抽取 1/6；同样交易量对协议收入的贡献可能相差数十倍。结论严格由\"收益率档位 × 收入方向\"矩阵得到。</div>\n    </section>\n\n    <footer class=\"src\">数据源　<b>DeFiLlama · dailyRevenue</b>　<b>CoinMarketCap · UNI 市场数据</b></footer>\n  </div>\n</div>\n\n<script>\nconst $ = (id) => document.getElementById(id);\nconst fmtK = (v) => {\n  if (v == null || isNaN(v)) return '—';\n  if (v >= 1e9) return '$' + (v/1e9).toFixed(2) + 'B';\n  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M';\n  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K';\n  return '$' + v.toFixed(0);\n};\nconst pct = (v, d=1) => (v == null || isNaN(v)) ? '—' : (v*100).toFixed(d) + '%';\nconst CHAIN_COLORS = {\n  'Robinhood Chain': '#e8a33d', 'Ethereum': '#4f9cf0', 'Base': '#2f6fed',\n  'Arbitrum': '#28a0f0', 'BSC': '#f0b90b', 'Polygon': '#8247e5',\n  'OP Mainnet': '#ff0420', '其他': '#9aa4b8'\n};\nlet SNAP = null, chart = null, curWin = 90;\n\nasync function load() {\n  const r = await fetch('/api/snapshot');\n  if (!r.ok) throw new Error('snapshot unavailable');\n  SNAP = await r.json();\n  render();\n}\n\nfunction render() {\n  const s = SNAP;\n  $('errBox').style.display = 'none';\n  $('main').style.display = 'block';\n\n  // 顶栏\n  const d0 = s.d0 || '';\n  const ft = new Date(s.fetchedAt);\n  const md = d0 ? d0.slice(5).replace('-','/') : '';\n  $('dataLine').textContent =\n    `完整数据截至 ${d0} UTC · 抓取 ${ft.getMonth()+1}/${ft.getDate()} ${String(ft.getHours()).padStart(2,'0')}:${String(ft.getMinutes()).padStart(2,'0')}`;\n\n  // 结论\n  const v = s.verdict;\n  const vt = $('vText');\n  vt.textContent = v.text;\n  vt.className = 'v-text' + (v.text.includes('买') ? ' buy' : v.text.includes('等') || v.text.includes('合理') ? ' wait' : '');\n  $('vExplain').textContent = v.explain || '';\n  $('vYield').textContent = v.yieldPct.toFixed(2) + '%';\n  $('vTier').textContent = v.tier;\n  $('vDir').innerHTML = `${v.direction} <small>${v.dirPct >= 0 ? '+' : ''}${v.dirPct.toFixed(1)}%</small>`;\n\n  // 刻度\n  $('gVal').textContent = v.yieldPct.toFixed(2) + '%';\n  $('gTick').style.left = Math.min(100, Math.max(0, v.yieldPct / 6 * 100)) + '%';\n\n  // KPI\n  const k = s.kpi;\n  $('kTodayL').textContent = '今日 · ' + md;\n  $('kTodayV').textContent = fmtK(k.today.v);\n  $('kTodayM').textContent = '×' + k.today.mult.toFixed(2);\n  const totals = s.series.totals;\n  const prev = totals.length > 1 ? totals[totals.length-2] : 0;\n  const dayChg = prev ? (k.today.v - prev) / prev * 100 : 0;\n  $('kTodayD').textContent = `比前日 ${dayChg >= 0 ? '+' : ''}${dayChg.toFixed(1)}%`;\n  $('kAvg7V').textContent = fmtK(k.avg7.v);\n  $('kAvg7M').textContent = '×' + k.avg7.mult.toFixed(2);\n  $('kAvg30V').textContent = fmtK(k.avg30.v);\n  $('kAvg30M').textContent = '×' + k.avg30.mult.toFixed(2);\n  $('kYtdL').textContent = `年初至今 · ${k.ytd.days}天`;\n  $('kYtdV').textContent = fmtK(k.ytd.sum);\n  $('kYtdA').textContent = fmtK(k.ytd.avg);\n  $('kYtdM').textContent = `日均 · ×${k.ytd.mult.toFixed(2)}`;\n  $('kRh7V').textContent = pct(k.robinhood.share7);\n  $('kRh30V').textContent = pct(k.robinhood.share30);\n\n  // 收益率表\n  const tb = $('ytBody');\n  tb.innerHTML = '';\n  s.yieldTable.forEach((r) => {\n    const isMain = r.name.includes('30天');\n    const tr = document.createElement('tr');\n    if (isMain) tr.className = 'hl';\n    tr.innerHTML = `<td>${r.name}<span class=\"rv\">${fmtK(r.v)}</span>${isMain ? '<span class=\"main-tag\">主口径</span>' : ''}</td>` +\n      `<td>${pct(r.vsMcap, 2)}</td><td>${pct(r.vsFdv, 2)}</td>`;\n    tb.appendChild(tr);\n  });\n\n  // 价格\n  const p = s.price;\n  $('pPrice').textContent = p.usd != null ? '$' + p.usd.toFixed(2) : '—';\n  $('pMcap').textContent = p.mcap ? fmtK(p.mcap) : '—';\n  $('pFdv').textContent = p.fdv ? fmtK(p.fdv) : '—';\n  $('pChg30').textContent = p.chg30d != null\n    ? `价格 30天 ${p.chg30d >= 0 ? '+' : ''}${p.chg30d.toFixed(1)}%` : '价格 30天 —';\n  $('pDiv').textContent = `收入 7d vs 30d ${v.dirPct >= 0 ? '+' : ''}${v.dirPct.toFixed(1)}%`;\n  let note = '价格与收入方向暂无明显背离。';\n  if (v.direction === '在跌' && (p.chg30d || 0) > 20) note = '价格走强、收入走弱：当前存在反向背离。';\n  else if (v.direction === '在涨' && (p.chg30d || 0) < -20) note = '收入走强、价格走弱：数据在涨、价格不动。';\n  $('pNote').textContent = note;\n\n  drawChart();\n}\n\nfunction drawChart() {\n  const s = SNAP, n = s.series.dates.length;\n  const win = curWin === 0 ? n : Math.min(curWin, n);\n  const idx = [...Array(win).keys()].map(i => n - win + i);\n  const dates = idx.map(i => s.series.dates[i].slice(5).replace('-','/'));\n  const names = Object.keys(s.series.chains);\n  const series = names.map(nm => ({\n    name: nm, type: 'bar', stack: 'rev',\n    data: idx.map(i => Math.round(s.series.chains[nm][i] || 0)),\n    itemStyle: { color: CHAIN_COLORS[nm] || '#9aa4b8' },\n    barMaxWidth: 14,\n  }));\n  series.push({\n    name: '30天均值', type: 'line', symbol: 'none',\n    data: idx.map(i => s.series.ma30[i] == null ? null : Math.round(s.series.ma30[i])),\n    lineStyle: { color: '#e64980', width: 2 }, itemStyle: { color: '#e64980' },\n  });\n  const aug = s.augBaseline;\n  if (!chart) chart = echarts.init($('chart'));\n  chart.setOption({\n    grid: { left: 52, right: 12, top: 30, bottom: 64 },\n    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },\n    legend: {\n      bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8,\n      textStyle: { color: '#5c6b82', fontSize: 11 },\n      data: [...names, '30天均值'],\n    },\n    xAxis: { type: 'category', data: dates, axisLabel: { color: '#8d99ad', fontSize: 11 } },\n    yAxis: {\n      type: 'value',\n      axisLabel: { color: '#8d99ad', fontSize: 11, formatter: (v) => v >= 1e6 ? (v/1e6).toFixed(2)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v },\n      splitLine: { lineStyle: { color: '#eef2f7' } },\n    },\n    series,\n  }, true);\n  // 8月基线\n  if (aug) {\n    chart.setOption({\n      series: [{\n        id: 'aug', type: 'line', symbol: 'none', silent: true,\n        markLine: {\n          silent: true, symbol: 'none',\n          lineStyle: { color: '#e64980', type: 'dashed', width: 1.5 },\n          label: { color: '#e64980', fontSize: 11, formatter: '8月基线', position: 'insideEndTop' },\n          data: [{ yAxis: Math.round(aug) }],\n        },\n        data: [],\n      }],\n    });\n  }\n  const sum = idx.reduce((t, i) => t + s.series.totals[i], 0);\n  $('winSum').textContent = fmtK(sum);\n}\n\n$('tabs').addEventListener('click', (e) => {\n  const b = e.target.closest('button');\n  if (!b) return;\n  document.querySelectorAll('#tabs button').forEach(x => x.classList.remove('on'));\n  b.classList.add('on');\n  curWin = +b.dataset.n;\n  drawChart();\n});\n\nasync function manualRefresh() {\n  const btn = $('refreshBtn');\n  btn.disabled = true;\n  try {\n    const r = await fetch('/api/refresh', { method: 'POST' });\n    const j = await r.json();\n    if (!j.ok) throw new Error(j.error || 'refresh failed');\n    await load();\n  } catch (e) {\n    $('errBox').style.display = 'block';\n    $('errMsg').textContent = '数据暂不可用：' + e.message + '，请稍后重试。';\n  } finally { btn.disabled = false; }\n}\n$('refreshBtn').addEventListener('click', manualRefresh);\nwindow.addEventListener('resize', () => chart && chart.resize());\n\nload().catch((e) => {\n  $('errBox').style.display = 'block';\n  $('errMsg').textContent = '数据暂不可用：' + e.message + '，请稍后点击\"立即刷新\"重试。';\n});\n</script>\n</body>\n</html>\n";

const LLAMA_URL = 'https://api.llama.fi/summary/fees/uniswap?dataType=dailyRevenue';
const CG_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=uniswap&price_change_percentage=7d,30d';

// DeFiLlama 价格备用源（CoinGecko 常屏蔽数据中心 IP）
const LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/coingecko:uniswap';
const llamaHist = (ts) => `https://coins.llama.fi/prices/historical/${ts}/coingecko:uniswap`;
const UNI_TOTAL_SUPPLY = 1e9; // UNI 总供应 10 亿固定，FDV = 现价 × 1e9

// UTC 时间戳（秒）
const AUG_START = 1785542400; // 2026-08-01T00:00:00Z
const AUG_END = 1788220800; // 2026-09-01T00:00:00Z
const YTD_START = 1767225600; // 2026-01-01T00:00:00Z

// 分链堆叠展示的主力链（按近 30 天协议收入排序），其余并入"其他"
const TOP_CHAINS = [
  'Robinhood Chain',
  'Ethereum',
  'Base',
  'Arbitrum',
  'BSC',
  'Polygon',
  'OP Mainnet',
];

function dayTotal(bd) {
  let s = 0;
  for (const ch of Object.values(bd)) for (const v of Object.values(ch)) s += v;
  return s;
}

function chainTotal(bd, chain) {
  const c = bd[chain];
  if (!c) return 0;
  let s = 0;
  for (const v of Object.values(c)) s += v;
  return s;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmtDate = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

// 估值档位：主收益率 = 30天日均协议收入 × 365 ÷ FDV
function tierOf(y) {
  if (y < 0.02) return '贵';
  if (y < 0.03) return '中间偏贵';
  if (y < 0.04) return '中间';
  if (y < 0.06) return '便宜';
  return '很便宜';
}

// 结论矩阵：估值档位 × 收入方向
function verdictOf(tier, dir) {
  const cheap = tier === '便宜' || tier === '很便宜';
  const mid = tier === '中间';
  if (cheap && dir === '在涨') return '可以买（不贵）';
  if (cheap) return '便宜但动量弱，等企稳或分批';
  if (mid && dir === '在涨') return '合理，等回调';
  if (mid) return '不动';
  if (dir === '在涨') return '不动，等回调';
  return '不动（贵）';
}

const EXPLAINS = {
  '可以买（不贵）': '收益率进入便宜区间，且短期收入趋势向上。',
  '便宜但动量弱，等企稳或分批': '估值已便宜，但短期收入动量转弱，等企稳或分批。',
  '合理，等回调': '估值合理，短期收入在涨，等回调。',
  '不动': '估值中等，短期收入动量不足，先不动。',
  '不动，等回调': '估值偏贵但短期收入在涨，等回调。',
  '不动（贵）': '收益率偏低，同时短期协议收入未强于30日趋势。',
};

function buildSnapshot(rev, cg) {
  const rows = rev.totalDataChartBreakdown;
  if (!rows || !rows.length) throw new Error('empty llama payload');

  // D0 = 最近一个完整 UTC 日：必须排除 UTC 当天未完成的数据点
  const nowSec = Math.floor(Date.now() / 1000);
  const utcMidnight = nowSec - (nowSec % 86400);
  const done = rows.filter((r) => r[0] < utcMidnight);
  if (!done.length) throw new Error('no complete day');

  const totals = done.map((r) => dayTotal(r[1]));
  const dates = done.map((r) => fmtDate(r[0]));
  const n = done.length;

  const today = totals[n - 1];
  const avg7 = mean(totals.slice(-7));
  const avg30 = mean(totals.slice(-30));

  // 8月基线 = 2026-08-01~08-31 日均协议收入（动态计算）
  const augRows = done.filter((r) => r[0] >= AUG_START && r[0] < AUG_END);
  const augBaseline = augRows.length ? mean(augRows.map((r) => dayTotal(r[1]))) : 0;

  // 年初至今
  const ytdRows = done.filter((r) => r[0] >= YTD_START);
  const ytdSum = ytdRows.reduce((s, r) => s + dayTotal(r[1]), 0);
  const ytdAvg = ytdRows.length ? ytdSum / ytdRows.length : 0;

  // 收入方向：7天均值 vs 30天均值，±5% 阈值
  const dirPct = avg30 ? (avg7 - avg30) / avg30 : 0;
  const direction = dirPct > 0.05 ? '在涨' : dirPct < -0.05 ? '在跌' : '走平';

  const price = cg || {};
  const fdv = price.fully_diluted_valuation || 0;
  const mcap = price.market_cap || 0;
  const yld = fdv > 0 ? (avg30 * 365) / fdv : 0;
  const tier = tierOf(yld);
  const verdictText = verdictOf(tier, direction);

  // Robinhood 收入占比：7天 / 30天双口径
  const sumTot = (arr) => arr.reduce((s, r) => s + dayTotal(r[1]), 0);
  const sumRh = (arr) => arr.reduce((s, r) => s + chainTotal(r[1], 'Robinhood Chain'), 0);
  const last7 = done.slice(-7);
  const last30 = done.slice(-30);
  const rh7 = sumTot(last7) ? sumRh(last7) / sumTot(last7) : 0;
  const rh30 = sumTot(last30) ? sumRh(last30) / sumTot(last30) : 0;

  // 分链日序列（主力链 + 其他）
  const chains = {};
  for (const ch of TOP_CHAINS) chains[ch] = done.map((r) => chainTotal(r[1], ch));
  chains['其他'] = done.map((r) => {
    let s = dayTotal(r[1]);
    for (const ch of TOP_CHAINS) s -= chainTotal(r[1], ch);
    return Math.max(0, s);
  });

  // 7/30天均线（数据不足处为 null）
  const ma = (k) =>
    totals.map((_, i) => (i + 1 >= k ? mean(totals.slice(i + 1 - k, i + 1)) : null));

  // 四种收入年化 × 流通市值 / FDV 收益率表
  const ann = (v) => v * 365;
  const yieldTable = [
    { name: '今日年化', v: ann(today) },
    { name: '7天日均年化', v: ann(avg7) },
    { name: '30天日均年化', v: ann(avg30) },
    { name: '年初至今日均年化', v: ann(ytdAvg) },
  ].map((r) => ({
    ...r,
    vsMcap: mcap ? r.v / mcap : 0,
    vsFdv: fdv ? r.v / fdv : 0,
  }));

  // 价格与收入背离提示
  const chg7 = price.price_change_percentage_7d_in_currency ?? null;
  let divergence;
  if (direction === '在跌' && chg7 !== null && chg7 > 5) {
    divergence = `价格7天上涨 ${chg7.toFixed(1)}%，但协议收入在跌（7天相对30天 ${(dirPct * 100).toFixed(1)}%），注意背离。`;
  } else if (direction === '在涨' && chg7 !== null && chg7 < -5) {
    divergence = `协议收入在涨（7天相对30天 +${(dirPct * 100).toFixed(1)}%），但价格7天 ${chg7.toFixed(1)}%，数据在涨、价格不动。`;
  } else {
    divergence = '价格与收入方向暂无明显背离。';
  }

  return {
    fetchedAt: new Date().toISOString(),
    d0: fmtDate(done[n - 1][0]), // 文案统一用"今日"，此处仅存日期
    price: {
      usd: price.current_price ?? null,
      mcap,
      fdv,
      chg24h: price.price_change_percentage_24h ?? null,
      chg7d: chg7,
      chg30d: price.price_change_percentage_30d_in_currency ?? null,
    },
    augBaseline,
    kpi: {
      today: { v: today, mult: augBaseline ? today / augBaseline : 0 },
      avg7: { v: avg7, mult: augBaseline ? avg7 / augBaseline : 0 },
      avg30: { v: avg30, mult: augBaseline ? avg30 / augBaseline : 0 },
      ytd: {
        sum: ytdSum,
        days: ytdRows.length,
        avg: ytdAvg,
        mult: augBaseline ? ytdAvg / augBaseline : 0,
      },
      robinhood: { share7: rh7, share30: rh30 },
    },
    verdict: {
      yieldPct: yld * 100,
      tier,
      direction,
      dirPct: dirPct * 100,
      text: verdictText,
      explain: EXPLAINS[verdictText],
    },
    yieldTable,
    divergence,
    series: { dates, totals, chains, ma7: ma(7), ma30: ma(30) },
  };
}

async function getPriceFromLlama() {
  const now = Math.floor(Date.now() / 1000);
  const urls = [
    LLAMA_PRICE_URL,
    llamaHist(now - 86400),
    llamaHist(now - 7 * 86400),
    llamaHist(now - 30 * 86400),
    'https://api.llama.fi/protocol/uniswap', // 取流通市值 mcap
  ];
  const rs = await Promise.all(urls.map((u) => fetch(u)));
  if (rs.some((r) => !r.ok)) throw new Error('llama price failed');
  const js = await Promise.all(rs.map((r) => r.json()));
  const px = (j) => j.coins['coingecko:uniswap'].price;
  const [p0, p1, p7, p30] = js.slice(0, 4).map(px);
  if (!p0) throw new Error('llama price empty');
  const chg = (p) => (((p0 - p) / p) * 100);
  return {
    current_price: p0,
    fully_diluted_valuation: p0 * UNI_TOTAL_SUPPLY,
    market_cap: js[4].mcap || null,
    price_change_percentage_24h: chg(p1),
    price_change_percentage_7d_in_currency: chg(p7),
    price_change_percentage_30d_in_currency: chg(p30),
  };
}

// 价格：优先 CoinGecko（带完整市值），被屏蔽时降级到 DeFiLlama
async function getPrice() {
  try {
    const r = await fetch(CG_URL, { headers: { 'user-agent': 'uni-dashboard/1.0' } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr[0] && arr[0].current_price) return arr[0];
    }
  } catch {}
  try {
    return await getPriceFromLlama();
  } catch {}
  return null;
}

async function refreshSnapshot(env) {
  try {
    const [rr, price] = await Promise.all([fetch(LLAMA_URL), getPrice()]);
    if (!rr.ok) throw new Error(`upstream ${rr.status}`);
    const rev = await rr.json();
    const snap = buildSnapshot(rev, price);
    await env.CACHE.put('snapshot', JSON.stringify(snap));
    return snap;
  } catch (e) {
    // 抓取失败：保留 KV 中的旧快照，不覆盖
    return await env.CACHE.get('snapshot', 'json');
  }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  // Cron Trigger：每小时整点刷新快照
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshSnapshot(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/snapshot' && request.method === 'GET') {
      let snap = await env.CACHE.get('snapshot', 'json');
      if (!snap) snap = await refreshSnapshot(env); // KV 为空时先触发一次抓取
      if (!snap) return json({ error: 'snapshot unavailable' }, 503);
      return json(snap);
    }

    if (url.pathname === '/api/debug' && request.method === 'GET') {
      const out = {};
      try {
        const r = await fetch(LLAMA_URL);
        out.revenue = { ok: r.ok, status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      } catch (e) { out.revenue = { error: String(e && e.message || e) }; }
      try {
        const r = await fetch(CG_URL, { headers: { 'user-agent': 'uni-dashboard/1.0' } });
        out.coingecko = { ok: r.ok, status: r.status };
      } catch (e) { out.coingecko = { error: String(e && e.message || e) }; }
      try {
        const r = await fetch(LLAMA_PRICE_URL);
        out.llamaPrice = { ok: r.ok, status: r.status };
      } catch (e) { out.llamaPrice = { error: String(e && e.message || e) }; }
      try {
        await env.CACHE.put('__debug', '1', { expirationTtl: 60 });
        out.kv = { writeRead: (await env.CACHE.get('__debug')) === '1' };
      } catch (e) { out.kv = { error: String(e && e.message || e) }; }
      return json(out);
    }

    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      const snap = await refreshSnapshot(env);
      if (!snap) return json({ error: 'refresh failed, kept old snapshot' }, 502);
      return json({ ok: true, fetchedAt: snap.fetchedAt });
    }

    // 静态前端（构建时已内联进 INDEX_HTML，不再依赖 ASSETS 绑定）
    return new Response(INDEX_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    });
  },
};
