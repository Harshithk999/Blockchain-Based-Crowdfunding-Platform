module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,  // Changed to 7545 to match Ganache GUI
      network_id: "*"
    }
  },
  compilers: {
    solc: {
      version: "0.8.0"
    }
  }
};