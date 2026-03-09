import axios from "axios";
const timeout = 30000;
const baseUrl = "http://127.0.0.1:2268";

class Hidemyacc {
  constructor() {}

  async me() {
    return await this.get(`${baseUrl}/me`);
  }

  async folders() {
    return await this.get(`${baseUrl}/folders`);
  }

  async profiles() {
    return await this.get(`${baseUrl}/profiles`);
  }

  async create(
    os = "win",
    name = undefined,
    notes = undefined,
    browser = "chrome",
    proxy = undefined
  ) {
    const body = {
      os,
      name,
      notes,
      browser,
      proxy: proxy ? JSON.stringify(proxy) : undefined,
    };
    return await this.post(`${baseUrl}/profiles`, body);
  }

  async start(id, body = {}) {
    try {
      return await this.post(`${baseUrl}/profiles/start/${id}`, body);
    } catch (e) {
      return false;
    }
  }

  async stop(id) {
    try {
      return await this.post(`${baseUrl}/profiles/stop/${id}`);
    } catch (e) {
      return false;
    }
  }

  async delete(id) {
    try {
      return await this.deleteAxios(`${baseUrl}/profiles/${id}`);
    } catch (e) {
      return false;
    }
  }

  async update(id, proxy) {
    try {
      return await this.put(`${baseUrl}/profiles/${id}`, JSON.stringify(proxy));
    } catch (e) {
      return false;
    }
  }

  async put(url, proxy) {
    try {
      const response = await axios.put(
        url,
        { proxy },
        {
          Accept: "application/json",
          "Content-Type": "application/json",
          timeout,
        }
      );
      return response.data;
    } catch (e) {
      return null;
    }
  }

  async get(url) {
    try {
      const response = await axios.get(url, {
        Accept: "application/json",
        "Content-Type": "application/json",
        timeout,
      });
      return response.data;
    } catch (e) {}
    return null;
  }

  async deleteAxios(url) {
    try {
      const response = await axios.delete(url, {
        Accept: "application/json",
        "Content-Type": "application/json",
        timeout,
      });
      return response.data;
    } catch (e) {}
    return null;
  }

  async post(url, body = {}) {
    try {
      const response = await axios.post(url, body, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout,
      });
      return response.data;
    } catch (e) {}
    return null;
  }
}

export default Hidemyacc;
